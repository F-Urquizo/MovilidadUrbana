// traffic_agents.js

"use strict";

import * as twgl from "twgl.js";
import GUI from "lil-gui";

// Importar tus librerías v3 y m4
import { v3, m4 } from "./libs/starter_3D_lib.js"; // Ajusta la ruta según corresponda

// Vertex Shader
const vsGLSL = `#version 300 es
precision highp float;

in vec4 a_position;
in vec3 a_normal;

// Scene uniforms
uniform vec3 u_viewWorldPosition;
uniform vec3 u_lightWorldPosition;

// Model uniforms
uniform mat4 u_world;
uniform mat4 u_worldInverseTransform;
uniform mat4 u_worldViewProjection;

out vec3 v_normal;
out vec3 v_lightDirection;
out vec3 v_cameraDirection;

void main() {
    gl_Position = u_worldViewProjection * a_position;

    v_normal = mat3(u_world) * a_normal;

    vec3 transformedPosition = (u_world * a_position).xyz;

    v_lightDirection = u_lightWorldPosition - transformedPosition;

    v_cameraDirection = u_viewWorldPosition - transformedPosition;
}
`;

// Fragment Shader
const fsGLSL = `#version 300 es
precision highp float;

in vec3 v_normal;
in vec3 v_lightDirection;
in vec3 v_cameraDirection;

// Scene uniforms
uniform vec4 u_ambientLight;
uniform vec4 u_diffuseLight;
uniform vec4 u_specularLight;

// Model uniforms
uniform vec4 u_ambientColor;
uniform vec4 u_diffuseColor;
uniform vec4 u_specularColor;
uniform float u_shininess;

out vec4 outColor;

void main() {
    // Normalize the received vectors, which are interpolated
    vec3 v_n_n = normalize(v_normal);
    vec3 v_l_n = normalize(v_lightDirection);
    vec3 v_c_n = normalize(v_cameraDirection);

    // Ambient lighting component
    vec4 ambient = u_ambientLight * u_ambientColor;

    // Diffuse light component
    vec4 diffuse = vec4(0, 0, 0, 1);
    float lambert = dot(v_n_n, v_l_n);
    if (lambert > 0.0) {
        diffuse = u_diffuseLight * u_diffuseColor * lambert;
    }

    // Specular component
    vec4 specular = vec4(0, 0, 0, 1);
    float specAngle = max(dot(reflect(-v_l_n, v_n_n), v_c_n), 0.0);
    float specFactor = pow(specAngle, u_shininess);
    specular = u_specularLight * u_specularColor * specFactor;

    outColor = ambient + diffuse + specular;
}
`;

// Clase Object3D
class Object3D {
  constructor(
    id,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = [1, 1, 1],
    color = [0.5, 0.5, 0.5, 1.0]
  ) {
    this.id = id;
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
    this.color = color;
    this.matrix = m4.identity();
  }
}

// URI del servidor Flask
const agent_server_uri = "http://localhost:8585/";

// Variables globales
let gl, programInfo;
let carVao, carBufferInfo;
let obstacleVao, obstacleBufferInfo;
let buildingVao, buildingBufferInfo;

const carAgents = {}; // Mapa de agentes Car por ID
const obstacleAgents = {}; // Mapa de agentes Obstacle por ID
const buildingAgents = {}; // Mapa de agentes Building por ID

// **Parámetros de la Cámara con Proxy para Monitoreo**
const cameraPosition = new Proxy(
  { x: 0, y: 25, z: 25 }, // Valores iniciales
  {
    set(target, prop, value) {
      if (["x", "y", "z"].includes(prop)) {
        console.log(
          `cameraPosition.${prop} cambiado de ${target[prop]} a ${value}`
        );
        target[prop] = value;
        return true;
      }
      console.warn(
        `Intento de modificar propiedad inválida: cameraPosition.${prop}`
      );
      return false;
    },
    get(target, prop) {
      if (["x", "y", "z"].includes(prop)) {
        return target[prop];
      }
      console.warn(
        `Intento de acceder a propiedad inválida: cameraPosition.${prop}`
      );
      return undefined;
    },
  }
);

// **Parámetros de Iluminación**
const lightPosition = {
  x: 10, // Inicialmente en 10
  y: 10, // Inicialmente en 10
  z: 10, // Inicialmente en 10
};
let lightAmbientColor = [0.3, 0.3, 0.3, 1.0];
let lightDiffuseColor = [1.0, 1.0, 1.0, 1.0];
let lightSpecularColor = [1.0, 1.0, 1.0, 1.0];

const data = { NAgents: 10, width: 100, height: 100 };
let frameCount = 0;

// Función para generar un color aleatorio
function getRandomColor() {
  return [Math.random(), Math.random(), Math.random(), 1.0];
}

// Función para cargar archivos OBJ sin color (color se asigna por tipo)
async function loadOBJ(url) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Error HTTP! Estado: ${response.status}`);
    }

    const objText = await response.text();
    const parsedOBJ = parseOBJ(objText, url);

    if (parsedOBJ) {
      // console.log(`OBJ cargado correctamente desde ${url}.`);
    } else {
      console.error(`Error al parsear el OBJ desde ${url}.`);
    }

    return parsedOBJ;
  } catch (error) {
    console.error(`Error al cargar el archivo OBJ desde ${url}:`, error);
    return null;
  }
}

// Función para parsear archivos OBJ
function parseOBJ(objText, url) {
  const positions = [];
  const normals = [];
  const indices = [];
  const tempPositions = [];
  const tempNormals = [];
  const uniqueVertices = {};
  let index = 0;

  const lines = objText.split("\n");

  for (const line of lines) {
    const trimmedLine = line.trim();
    if (trimmedLine === "" || trimmedLine.startsWith("#")) continue;

    const parts = trimmedLine.replace(/^\uFEFF/, "").split(/\s+/);
    const keyword = parts[0];

    if (keyword === "v") {
      const position = parts.slice(1).map(Number);
      tempPositions.push(position);
    } else if (keyword === "vn") {
      const normal = parts.slice(1).map(Number);
      tempNormals.push(normal);
    } else if (keyword === "f") {
      const faceVertices = parts.slice(1);

      // Triangulación si es necesario
      for (let i = 1; i < faceVertices.length - 1; i++) {
        const vertices = [
          faceVertices[0],
          faceVertices[i],
          faceVertices[i + 1],
        ];

        vertices.forEach((vertex) => {
          const [vStr, vtStr, vnStr] = vertex.split("/");
          const vIndex = parseInt(vStr, 10) - 1;
          const vnIndex = vnStr ? parseInt(vnStr, 10) - 1 : -1;

          const key = `${vIndex}//${vnIndex}`;

          if (!(key in uniqueVertices)) {
            uniqueVertices[key] = index++;

            const position = tempPositions[vIndex];
            positions.push(...position);

            if (vnIndex >= 0 && tempNormals[vnIndex]) {
              const normal = tempNormals[vnIndex];
              normals.push(...normal);
            } else {
              normals.push(0, 0, 1); // Normal por defecto
            }
          }

          indices.push(uniqueVertices[key]);
        });
      }
    }
  }

  if (positions.length === 0 || indices.length === 0 || normals.length === 0) {
    console.error(
      `Los datos del OBJ parseado desde ${url} están incompletos. Revisa el contenido del archivo OBJ.`
    );
    return null;
  }

  // console.log(`OBJ parseado desde ${url}:`);
  // console.log(`- Vértices únicos: ${positions.length / 3}`);
  // console.log(`- Normales únicas: ${normals.length / 3}`);
  // console.log(`- Índices: ${indices.length}`);

  return {
    a_position: { numComponents: 3, data: positions },
    a_normal: { numComponents: 3, data: normals },
    indices: { numComponents: 1, data: indices },
  };
}

// Función principal
async function main() {
  const canvas = document.querySelector("canvas");
  if (!canvas) {
    console.error("Elemento canvas no encontrado en el HTML.");
    return;
  }

  gl = canvas.getContext("webgl2");
  if (!gl) {
    console.error("WebGL2 no es soportado en este navegador.");
    return;
  }

  programInfo = twgl.createProgramInfo(gl, [vsGLSL, fsGLSL]);

  // Cargar archivos OBJ
  const [carObjURL, buildingObjURL, cubeObjURL] = [
    "./car.obj",
    "./low_building.obj",
    "./cube.obj",
  ];

  const [loadedCarArrays, loadedBuildingArrays, loadedCubeArrays] =
    await Promise.all([
      loadOBJ(carObjURL),
      loadOBJ(cubeObjURL),
      loadOBJ(buildingObjURL),
    ]);

  // Crear VAOs y BufferInfos
  if (loadedCarArrays) {
    carBufferInfo = twgl.createBufferInfoFromArrays(gl, loadedCarArrays);
    carVao = twgl.createVAOFromBufferInfo(gl, programInfo, carBufferInfo);
    // console.log("VAO y BufferInfo de Car creados correctamente.");
  } else {
    console.error("Falló la carga o el parseo del archivo OBJ de Car.");
    return;
  }

  if (loadedBuildingArrays) {
    buildingBufferInfo = twgl.createBufferInfoFromArrays(
      gl,
      loadedBuildingArrays
    );
    buildingVao = twgl.createVAOFromBufferInfo(
      gl,
      programInfo,
      buildingBufferInfo
    );
    // console.log("VAO y BufferInfo de Building creados correctamente.");
  } else {
    console.error(
      "Falló la carga o el parseo del archivo OBJ de low_building."
    );
    return;
  }

  if (loadedCubeArrays) {
    obstacleBufferInfo = twgl.createBufferInfoFromArrays(gl, loadedCubeArrays);
    obstacleVao = twgl.createVAOFromBufferInfo(
      gl,
      programInfo,
      obstacleBufferInfo
    );
    // console.log("VAO y BufferInfo de Obstacles creados correctamente.");
  } else {
    console.error("Falló la carga o el parseo del archivo OBJ de cube.");
    return;
  }

  setupUI();
  await initAgentsModel(); // `drawScene` será llamado aquí
}

/*
 * Inicializa el modelo de agentes enviando una solicitud POST al servidor.
 */
async function initAgentsModel() {
  try {
    const response = await fetch(agent_server_uri + "init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      const result = await response.json();
      // console.log("Datos recibidos en init:", result);
      // console.log("Modelo inicializado:", result.message);

      // Limpiar diccionarios de agentes
      Object.keys(carAgents).forEach((key) => delete carAgents[key]);
      Object.keys(obstacleAgents).forEach((key) => delete obstacleAgents[key]);
      Object.keys(buildingAgents).forEach((key) => delete buildingAgents[key]);

      // Asignar color único usando colores aleatorios
      if (result.car_agents) {
        result.car_agents.forEach((agent) => {
          carAgents[agent.id] = new Object3D(
            agent.id,
            [
              agent.x - data.width / 2, // Desplazamiento en X
              agent.y,
              agent.z - data.height / 2, // Desplazamiento en Z
            ],
            [0, 0, 0],
            [0.5, 0.5, 0.5], // Escala para coches
            getRandomColor() // Asignar color único de coche
          );
        });
      }

      if (result.obstacle_agents) {
        result.obstacle_agents.forEach((obstacle) => {
          obstacleAgents[obstacle.id] = new Object3D(
            obstacle.id,
            [
              obstacle.x - data.width / 2, // Desplazamiento en X
              obstacle.y,
              obstacle.z - data.height / 2, // Desplazamiento en Z
            ],
            [0, 0, 0],
            [1, 1, 1], // Escala reducida para obstáculos
            getRandomColor() // Asignar color único de obstáculo
          );
        });
      }

      if (result.building_agents) {
        // Asegurarse de que se llama building_agents
        result.building_agents.forEach((agent) => {
          buildingAgents[agent.id] = new Object3D(
            agent.id,
            [
              agent.x - data.width / 2, // Desplazamiento en X
              agent.y,
              agent.z - data.height / 2, // Desplazamiento en Z
            ],
            [0, 0, 0],
            [0.5, 0.5, 0.5], // Escala para edificios
            getRandomColor() // Asignar color único de edificio
          );
        });
      }

      // Actualizar el ancho y alto si es necesario
      if (result.width !== undefined) {
        data.width = result.width;
      }
      if (result.height !== undefined) {
        data.height = result.height;
      }

      // console.log(
      //   `Agentes inicializados: ${Object.keys(carAgents).length} coches, ${
      //     Object.keys(obstacleAgents).length
      //   } obstáculos, ${Object.keys(buildingAgents).length} edificios.`
      // );

      // **Iniciar el bucle de dibujo después de actualizar data.width y data.height**
      drawScene();
    } else {
      const errorResult = await response.json();
      console.error(
        `Error al inicializar el modelo. Estado: ${response.status}`,
        errorResult
      );
    }
  } catch (error) {
    console.error("Error al inicializar el modelo de agentes:", error);
  }
}

/*
 * Recupera las posiciones actuales de todos los agentes Car desde el servidor.
 */
async function getAgents() {
  try {
    const response = await fetch(agent_server_uri + "getAgents");

    if (response.ok) {
      const result = await response.json();

      // Actualizar posiciones de los agentes existentes o agregar nuevos
      if (result.positions) {
        result.positions.forEach((agentData) => {
          const agentId = agentData.id;
          if (carAgents[agentId]) {
            // Actualizar posición con desplazamiento
            carAgents[agentId].position = [
              agentData.x - data.width / 2, // Desplazamiento en X
              agentData.y,
              agentData.z - data.height / 2, // Desplazamiento en Z
            ];
          } else {
            // Nuevo agente, asignar color único y crear con desplazamiento
            carAgents[agentId] = new Object3D(
              agentId,
              [
                agentData.x - data.width / 2, // Desplazamiento en X
                agentData.y,
                agentData.z - data.height / 2, // Desplazamiento en Z
              ],
              [0, 0, 0],
              [0.5, 0.5, 0.5], // Escala para coches
              getRandomColor() // Asignar color único de coche
            );
          }
        });

        // Eliminar agentes que ya no están presentes
        const currentAgentIds = result.positions.map((agent) => agent.id);
        Object.keys(carAgents).forEach((agentId) => {
          if (!currentAgentIds.includes(agentId)) {
            delete carAgents[agentId];
          }
        });
      } else {
        console.warn(
          "No se encontraron posiciones de agentes en la respuesta."
        );
      }
    } else {
      const errorResult = await response.json();
      console.error(
        `Error al recuperar agentes Car. Estado: ${response.status}`,
        errorResult
      );
    }
  } catch (error) {
    console.error("Error al recuperar agentes Car:", error);
  }
}

/*
 * Recupera las posiciones actuales de todos los agentes Obstacle desde el servidor.
 */
async function getObstacles() {
  try {
    const response = await fetch(agent_server_uri + "getObstacles");

    if (response.ok) {
      const result = await response.json();

      // console.log("Datos de obstáculos recibidos:", result.positions);

      // Actualizar posiciones de los obstáculos existentes o agregar nuevos
      if (result.positions) {
        result.positions.forEach((obstacleData) => {
          const obstacleId = obstacleData.id;
          if (obstacleAgents[obstacleId]) {
            // Actualizar posición con desplazamiento
            obstacleAgents[obstacleId].position = [
              obstacleData.x - data.width / 2, // Desplazamiento en X
              obstacleData.y,
              obstacleData.z - data.height / 2, // Desplazamiento en Z
            ];
          } else {
            // Nuevo obstáculo, asignar color único y crear con desplazamiento
            obstacleAgents[obstacleId] = new Object3D(
              obstacleId,
              [
                obstacleData.x - data.width / 2, // Desplazamiento en X
                obstacleData.y,
                obstacleData.z - data.height / 2, // Desplazamiento en Z
              ],
              [0, 0, 0],
              [1, 1, 1], // Escala reducida para obstáculos
              getRandomColor() // Asignar color único de obstáculo
            );
          }
        });

        // Eliminar obstáculos que ya no están presentes
        const currentObstacleIds = result.positions.map(
          (obstacle) => obstacle.id
        );
        Object.keys(obstacleAgents).forEach((obstacleId) => {
          if (!currentObstacleIds.includes(obstacleId)) {
            delete obstacleAgents[obstacleId];
          }
        });

        // console.log(
        //   `Obstáculos actualizados: ${
        //     Object.keys(obstacleAgents).length
        //   } obstáculos.`
        // );
      } else {
        console.warn(
          "No se encontraron posiciones de obstáculos en la respuesta."
        );
      }
    } else {
      const errorResult = await response.json();
      console.error(
        `Error al recuperar obstáculos. Estado: ${response.status}`,
        errorResult
      );
    }
  } catch (error) {
    console.error("Error al recuperar obstáculos:", error);
  }
}

/*
 * Recupera las posiciones actuales de otros agentes (Road, Traffic_Light, Destination) desde el servidor.
 */
async function getOtherAgents() {
  try {
    const response = await fetch(agent_server_uri + "getOtherAgents");

    if (response.ok) {
      const result = await response.json();

      // Limpiar agentes Building existentes
      if (result.building_agents) {
        Object.keys(buildingAgents).forEach(
          (key) => delete buildingAgents[key]
        );

        result.building_agents.forEach((agentData) => {
          const agentId = agentData.id;
          // Asignar color único y crear con desplazamiento
          buildingAgents[agentId] = new Object3D(
            agentId,
            [
              agentData.x - data.width / 2, // Desplazamiento en X
              agentData.y,
              agentData.z - data.height / 2, // Desplazamiento en Z
            ],
            [0, 0, 0],
            [0.5, 0.5, 0.5], // Escala para edificios
            getRandomColor() // Asignar color único de edificio
          );
        });

        // console.log(
        //   `Edificios actualizados: ${
        //     Object.keys(buildingAgents).length
        //   } edificios.`
        // );
      } else {
        console.warn("No se encontraron agentes de edificios en la respuesta.");
      }
    } else {
      const errorResult = await response.json();
      console.error(
        `Error al recuperar otros agentes. Estado: ${response.status}`,
        errorResult
      );
    }
  } catch (error) {
    console.error("Error al recuperar otros agentes:", error);
  }
}

/*
 * Dibuja la escena renderizando los agentes y obstáculos.
 */
function drawScene() {
  // Redimensionar el canvas para que coincida con el tamaño de visualización
  twgl.resizeCanvasToDisplaySize(gl.canvas);

  // Establecer el viewport para que coincida con el tamaño del canvas
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  // Establecer el color de borrado y habilitar la prueba de profundidad
  gl.clearColor(0.2, 0.2, 0.2, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);

  // Borrar los buffers de color y profundidad
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Usar el programa de shaders
  gl.useProgram(programInfo.program);

  // Configurar la matriz de vista-proyección y obtener la posición de la cámara
  const { viewProjectionMatrix, cameraPos } = setupWorldView(gl);

  // Configurar los uniformes globales de iluminación
  const globalUniforms = {
    u_viewWorldPosition: cameraPos,
    u_lightWorldPosition: [lightPosition.x, lightPosition.y, lightPosition.z],
    u_ambientLight: lightAmbientColor,
    u_diffuseLight: lightDiffuseColor,
    u_specularLight: lightSpecularColor,
  };

  twgl.setUniforms(programInfo, globalUniforms);

  // Dibujar Agentes Car
  if (carVao && carBufferInfo) {
    gl.bindVertexArray(carVao);
    Object.values(carAgents).forEach((car) => {
      drawModel(viewProjectionMatrix, car, carBufferInfo, "car");
    });
  }

  // Dibujar Agentes Obstacle
  if (obstacleVao && obstacleBufferInfo) {
    gl.bindVertexArray(obstacleVao);
    Object.values(obstacleAgents).forEach((obstacle) => {
      drawModel(viewProjectionMatrix, obstacle, obstacleBufferInfo, "obstacle");
    });
  }

  // Dibujar Agentes Building
  if (buildingVao && buildingBufferInfo) {
    gl.bindVertexArray(buildingVao);
    Object.values(buildingAgents).forEach((building) => {
      drawModel(viewProjectionMatrix, building, buildingBufferInfo, "building");
    });
  }

  // Incrementar el contador de frames
  frameCount++;

  // Actualizar la escena cada 30 frames
  if (frameCount % 30 === 0) {
    frameCount = 0;
    update(); // Actualizar agentes
  }

  // Log de la posición de la cámara en cada frame (opcional, puede generar mucha salida)
  // console.log(`Frame ${frameCount}: Cámara en (${cameraPos[0]}, ${cameraPos[1]}, ${cameraPos[2]})`);

  // Solicitar el siguiente frame
  requestAnimationFrame(drawScene);
}

/*
 * Dibuja un modelo específico.
 */
function drawModel(viewProjectionMatrix, agent, bufferInfo, type) {
  // Verificar que el agente tenga una posición válida
  if (!agent || !agent.position) {
    console.warn(`Agent ${agent.id} tiene una posición inválida.`);
    return;
  }

  // Crear matrices de transformación
  const translationMatrix = m4.translation(agent.position);
  const rotationX = m4.rotationX((agent.rotation[0] * Math.PI) / 180);
  const rotationY = m4.rotationY((agent.rotation[1] * Math.PI) / 180);
  const rotationZ = m4.rotationZ((agent.rotation[2] * Math.PI) / 180);
  const scaleMatrix = m4.scale([
    agent.scale[0],
    agent.scale[1],
    agent.scale[2],
  ]);

  // Combinar transformaciones
  let u_world = m4.multiply(translationMatrix, rotationX);
  u_world = m4.multiply(u_world, rotationY);
  u_world = m4.multiply(u_world, rotationZ);
  u_world = m4.multiply(u_world, scaleMatrix);

  // Calcular u_worldInverseTransform (inversa transpuesta de u_world)
  const u_worldInverseTransform = m4.transpose(m4.inverse(u_world));

  // Calcular u_worldViewProjection
  const u_worldViewProjection = m4.multiply(viewProjectionMatrix, u_world);

  // Establecer los colores del material basados en el tipo
  let ambientColor, diffuseColor;
  if (type === "car") {
    ambientColor = agent.color;
    diffuseColor = agent.color;
  } else if (type === "obstacle") {
    ambientColor = agent.color;
    diffuseColor = agent.color;
  } else if (type === "building") {
    ambientColor = agent.color;
    diffuseColor = agent.color;
  } else {
    ambientColor = [1.0, 1.0, 1.0, 1.0];
    diffuseColor = [1.0, 1.0, 1.0, 1.0];
  }

  // Establecer los uniformes del modelo
  const modelUniforms = {
    u_world,
    u_worldInverseTransform,
    u_worldViewProjection,
    u_ambientColor: ambientColor,
    u_diffuseColor: diffuseColor,
    u_specularColor: [1.0, 1.0, 1.0, 1.0],
    u_shininess: 50.0,
  };

  twgl.setUniforms(programInfo, modelUniforms);

  // Dibujar el modelo
  twgl.drawBufferInfo(gl, bufferInfo);
}

/*
 * Configura la matriz de vista-proyección.
 */
function setupWorldView(gl) {
  const fov = (45 * Math.PI) / 180; // Campo de visión de 45 grados
  const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
  const projectionMatrix = m4.perspective(fov, aspect, 1, 200);

  // Definir el objetivo (target) al origen
  const center = [0, 0, 0]; // Centrado en el origen
  const up = [0, 1, 0];

  // Posición de la cámara (absoluta)
  const camPos = [cameraPosition.x, cameraPosition.y, cameraPosition.z];

  // Log de la posición actual de la cámara
  console.log(
    `setupWorldView - Posición de la Cámara: x=${camPos[0]}, y=${camPos[1]}, z=${camPos[2]}`
  );

  // Crear la matriz de vista usando lookAt
  const cameraMatrix = m4.lookAt(camPos, center, up);
  const viewMatrix = m4.inverse(cameraMatrix);
  const viewProjectionMatrix = m4.multiply(projectionMatrix, viewMatrix);

  return {
    viewProjectionMatrix,
    cameraPos: camPos,
  };
}

/*
 * Configura la interfaz de usuario usando lil-gui.
 */
function setupUI() {
  const gui = new GUI();

  // **Controles de Posición de la Cámara**
  const cameraFolder = gui.addFolder("Posición de la Cámara");

  cameraFolder
    .add(cameraPosition, "x", -50, 50, 0.1) // Paso reducido a 0.1
    .name("Posición X")
    .onChange(() => {
      // No es necesario llamar a drawScene aquí ya que está en el bucle principal
    });
  cameraFolder
    .add(cameraPosition, "y", -50, 50, 0.1) // Paso reducido a 0.1
    .name("Posición Y")
    .onChange(() => {
      // No es necesario llamar a drawScene aquí ya que está en el bucle principal
    });
  cameraFolder
    .add(cameraPosition, "z", -50, 50, 0.1) // Paso reducido a 0.1
    .name("Posición Z")
    .onChange(() => {
      // No es necesario llamar a drawScene aquí ya que está en el bucle principal
    });

  cameraFolder.open();

  // **Controles de Iluminación**
  const lightFolder = gui.addFolder("Iluminación");

  lightFolder
    .addColor({ ambient: rgbToHex(lightAmbientColor) }, "ambient")
    .name("Ambiental")
    .onChange((value) => {
      lightAmbientColor = hexToRgbA(value);
      // No es necesario llamar a drawScene aquí ya que está en el bucle principal
    });

  lightFolder
    .addColor({ diffuse: rgbToHex(lightDiffuseColor) }, "diffuse")
    .name("Difusa")
    .onChange((value) => {
      lightDiffuseColor = hexToRgbA(value);
      // No es necesario llamar a drawScene aquí ya que está en el bucle principal
    });

  lightFolder
    .addColor({ specular: rgbToHex(lightSpecularColor) }, "specular")
    .name("Especular")
    .onChange((value) => {
      lightSpecularColor = hexToRgbA(value);
      // No es necesario llamar a drawScene aquí ya que está en el bucle principal
    });

  lightFolder.open();

  // **Controles de Posición de la Luz**
  const lightPositionFolder = gui.addFolder("Posición de la Luz");

  lightPositionFolder
    .add(lightPosition, "x", -50, 50, 1)
    .name("Posición X")
    .onChange(() => {
      // No es necesario llamar a drawScene aquí ya que está en el bucle principal
    });
  lightPositionFolder
    .add(lightPosition, "y", -50, 50, 1)
    .name("Posición Y")
    .onChange(() => {
      // No es necesario llamar a drawScene aquí ya que está en el bucle principal
    });
  lightPositionFolder
    .add(lightPosition, "z", -50, 50, 1)
    .name("Posición Z")
    .onChange(() => {
      // No es necesario llamar a drawScene aquí ya que está en el bucle principal
    });

  lightPositionFolder.open();

  // **Eliminación de Controles de Colores de Objetos**
  // Dado que cada objeto tiene un color único, se eliminan los controles de colores por tipo.
  // Si deseas agregar controles para modificar colores individuales, se requeriría una implementación más compleja.
}

/*
 * Actualiza las posiciones de los agentes enviando una solicitud al servidor.
 */
async function update() {
  try {
    const response = await fetch(agent_server_uri + "update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps: 1 }),
    });

    if (response.ok) {
      await getAgents();
      await getObstacles();
      await getOtherAgents();
    } else {
      const errorResult = await response.json();
      console.error(
        `Error en la actualización. Estado: ${response.status}`,
        errorResult
      );
    }
  } catch (error) {
    console.error("Error al actualizar agentes:", error);
  }
}

/*
 * Funciones para convertir colores entre HEX y RGBA
 */
function rgbToHex(rgbArray) {
  const r = Math.round(rgbArray[0] * 255);
  const g = Math.round(rgbArray[1] * 255);
  const b = Math.round(rgbArray[2] * 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

function hexToRgbA(hex) {
  const c = hex.replace("#", "");
  let bigint;
  if (c.length === 3) {
    bigint = parseInt(c[0] + c[0] + c[1] + c[1] + c[2] + c[2], 16);
  } else if (c.length === 6) {
    bigint = parseInt(c, 16);
  } else {
    // Manejar formatos HEX inválidos
    console.warn(`Formato HEX inválido: ${hex}`);
    return [1.0, 1.0, 1.0, 1.0];
  }
  const r = ((bigint >> 16) & 255) / 255;
  const g = ((bigint >> 8) & 255) / 255;
  const b = (bigint & 255) / 255;
  return [r, g, b, 1.0];
}

/*
 * Inicia la aplicación.
 */
main();
