// traffic_agents.js

"use strict";

import * as twgl from "twgl.js";
import GUI from "lil-gui";

// Vertex Shader
const vsGLSL = `#version 300 es
precision highp float;

in vec3 a_position;
in vec3 a_normal;

uniform mat4 u_matrix;

out vec3 v_normal;

void main() {
    gl_Position = u_matrix * vec4(a_position, 1.0);
    v_normal = mat3(u_matrix) * a_normal;
}
`;

// Fragment Shader
const fsGLSL = `#version 300 es
precision highp float;

in vec3 v_normal;
out vec4 outColor;

uniform vec3 u_lightDirection;
uniform vec4 u_objectColor;

void main() {
    float light = max(dot(normalize(v_normal), normalize(u_lightDirection)), 0.0);
    vec4 shadedColor = u_objectColor * light;
    outColor = shadedColor;
}
`;

// Clases Object3D
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
    this.matrix = twgl.m4.identity();
  }
}

// URI del servidor Flask
const agent_server_uri = "http://localhost:8585/";

// Variables globales
let gl, programInfo;
let carVao, carBufferInfo;
let obstacleVao, obstacleBufferInfo;
let buildingVao, buildingBufferInfo;
let squareVao, squareBufferInfo;

const carAgents = {}; // Mapa de agentes Car por ID
const carColors = {}; // Mapa de colores de Car por ID
const obstacleAgents = {}; // Mapa de agentes Obstacle por ID
const obstacleColors = {}; // Mapa de colores de Obstacle por ID
const buildingAgents = {}; // Mapa de agentes Building por ID
const buildingColors = {}; // Mapa de colores de Building por ID

const cameraPosition = { x: 0, y: 25, z: 25 };
const data = { NAgents: 10 };
let frameCount = 0;

// Colores predefinidos
const predefinedColors = [
  [1.0, 0.0, 0.0, 1.0],
  [0.0, 0.0, 1.0, 1.0],
  [0.0, 1.0, 0.0, 1.0],
  [1.0, 0.0, 1.0, 1.0],
  [1.0, 1.0, 0.0, 1.0],
  [1.0, 0.5, 0.0, 1.0],
  [0.5, 0.0, 0.5, 1.0],
  [0.0, 0.5, 0.5, 1.0],
  [0.5, 0.5, 0.5, 1.0],
  [1.0, 0.0, 0.5, 1.0],
];

// Función para obtener un color predefinido aleatorio
function getRandomPredefinedColor() {
  const randomIndex = Math.floor(Math.random() * predefinedColors.length);
  return predefinedColors[randomIndex];
}

// Función para cargar archivos OBJ sin color (color se asigna por objeto)
async function loadOBJ(url) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Error HTTP! Estado: ${response.status}`);
    }

    const objText = await response.text();
    const parsedOBJ = parseOBJ(objText, url);

    if (parsedOBJ) {
      console.log(`OBJ cargado correctamente desde ${url}.`);
    } else {
      console.error(`Error al parsear el OBJ desde ${url}.`);
    }

    return parsedOBJ;
  } catch (error) {
    console.error(`Error al cargar el archivo OBJ desde ${url}:`, error);
    return null;
  }
}

// Función para parsear archivos OBJ mejorada
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

  console.log(`OBJ parseado desde ${url}:`);
  console.log(`- Vértices únicos: ${positions.length / 3}`);
  console.log(`- Normales únicas: ${normals.length / 3}`);
  console.log(`- Índices: ${indices.length}`);

  return {
    a_position: { numComponents: 3, data: positions },
    a_normal: { numComponents: 3, data: normals },
    indices: { data: indices },
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
    console.log("VAO y BufferInfo de Car creados correctamente.");
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
    console.log("VAO y BufferInfo de Building creados correctamente.");
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
    console.log("VAO y BufferInfo de Obstacles creados correctamente.");
  } else {
    console.error("Falló la carga o el parseo del archivo OBJ de cube.");
    return;
  }

  setupUI();
  await initAgentsModel();
  await getAgents();
  await getObstacles();
  await getOtherAgents();
  drawScene();
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
      console.log("Datos recibidos en init:", result);
      console.log("Modelo inicializado:", result.message);

      // Limpiar diccionarios de agentes y colores
      Object.keys(carAgents).forEach((key) => delete carAgents[key]);
      Object.keys(carColors).forEach((key) => delete carColors[key]);

      result.car_agents.forEach((agent) => {
        // Asignar un color único a cada coche y almacenarlo
        const uniqueColor = getRandomPredefinedColor();
        carColors[agent.id] = uniqueColor;
        carAgents[agent.id] = new Object3D(
          agent.id,
          [agent.x, agent.y, agent.z],
          [0, 0, 0],
          [0.5, 0.5, 0.5], // Escala para coches
          uniqueColor
        );
      });

      // Limpiar diccionarios de obstáculos y colores
      Object.keys(obstacleAgents).forEach((key) => delete obstacleAgents[key]);
      Object.keys(obstacleColors).forEach((key) => delete obstacleColors[key]);

      result.obstacle_agents.forEach((obstacle) => {
        // Asignar un color único a cada obstáculo y almacenarlo
        const uniqueColor = getRandomPredefinedColor();
        obstacleColors[obstacle.id] = uniqueColor;
        obstacleAgents[obstacle.id] = new Object3D(
          obstacle.id,
          [obstacle.x, obstacle.y, obstacle.z],
          [0, 0, 0],
          [1, 1, 1], // Escala reducida para obstáculos
          uniqueColor
        );
      });

      // Actualizar el ancho y alto si es necesario
      data.width = result.width;
      data.height = result.height;

      console.log(
        `Agentes inicializados: ${Object.keys(carAgents).length} coches, ${
          Object.keys(obstacleAgents).length
        } obstáculos.`
      );
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
      result.positions.forEach((agentData) => {
        const agentId = agentData.id;
        if (carAgents[agentId]) {
          // Actualizar posición
          carAgents[agentId].position = [agentData.x, agentData.y, agentData.z];
        } else {
          // Nuevo agente, asignar color y crear
          const uniqueColor = getRandomPredefinedColor();
          carColors[agentId] = uniqueColor;
          carAgents[agentId] = new Object3D(
            agentId,
            [agentData.x, agentData.y, agentData.z],
            [0, 0, 0],
            [0.5, 0.5, 0.5], // Escala para coches
            uniqueColor
          );
        }
      });

      // Eliminar agentes que ya no están presentes
      const currentAgentIds = result.positions.map((agent) => agent.id);
      Object.keys(carAgents).forEach((agentId) => {
        if (!currentAgentIds.includes(agentId)) {
          delete carAgents[agentId];
          delete carColors[agentId];
        }
      });
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

      console.log("Datos de obstáculos recibidos:", result.positions);

      // Actualizar posiciones de los obstáculos existentes o agregar nuevos
      result.positions.forEach((obstacleData) => {
        const obstacleId = obstacleData.id;
        if (obstacleAgents[obstacleId]) {
          // Actualizar posición
          obstacleAgents[obstacleId].position = [
            obstacleData.x,
            obstacleData.y,
            obstacleData.z,
          ];
        } else {
          // Nuevo obstáculo, asignar color y crear
          const uniqueColor = getRandomPredefinedColor();
          obstacleColors[obstacleId] = uniqueColor;
          obstacleAgents[obstacleId] = new Object3D(
            obstacleId,
            [obstacleData.x, obstacleData.y, obstacleData.z],
            [0, 0, 0],
            [0.1, 0.1, 0.1],
            uniqueColor
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
          delete obstacleColors[obstacleId];
        }
      });

      console.log(
        `Obstáculos actualizados: ${
          Object.keys(obstacleAgents).length
        } obstáculos.`
      );
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
      Object.keys(buildingAgents).forEach((key) => delete buildingAgents[key]);
      Object.keys(buildingColors).forEach((key) => delete buildingColors[key]);

      result.positions.forEach((agentData) => {
        const agentId = agentData.id;
        // Asignar un color único a cada edificio y almacenarlo
        const uniqueColor = [0.7, 0.7, 0.7, 1.0]; // Color gris para edificios
        buildingColors[agentId] = uniqueColor;
        buildingAgents[agentId] = new Object3D(
          agentId,
          [agentData.x, agentData.y, agentData.z],
          [0, 0, 0],
          [0.5, 0.5, 0.5], // Escala para edificios
          uniqueColor
        );
      });

      console.log(
        `Edificios actualizados: ${
          Object.keys(buildingAgents).length
        } edificios.`
      );
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

  // Configurar la matriz de vista-proyección
  const viewProjectionMatrix = setupWorldView(gl);

  // Establecer uniform para la dirección de la luz
  const lightDirection = twgl.v3.normalize([0.5, 1, 0.75]);
  twgl.setUniforms(programInfo, { u_lightDirection: lightDirection });

  // Dibujar Agentes Car
  if (carVao && carBufferInfo) {
    gl.bindVertexArray(carVao);
    Object.values(carAgents).forEach((car) => {
      drawModel(viewProjectionMatrix, car, carBufferInfo);
    });
  }

  // Dibujar Agentes Obstacle
  if (obstacleVao && obstacleBufferInfo) {
    gl.bindVertexArray(obstacleVao);
    Object.values(obstacleAgents).forEach((obstacle) => {
      drawModel(viewProjectionMatrix, obstacle, obstacleBufferInfo);
    });
  }

  // Dibujar Agentes Building
  if (buildingVao && buildingBufferInfo) {
    gl.bindVertexArray(buildingVao);
    Object.values(buildingAgents).forEach((building) => {
      drawModel(viewProjectionMatrix, building, buildingBufferInfo);
    });
  }

  // Incrementar el contador de frames
  frameCount++;

  // Actualizar la escena cada 30 frames
  if (frameCount % 30 === 0) {
    frameCount = 0;
    update(); // Actualizar agentes
  }

  // Solicitar el siguiente frame
  requestAnimationFrame(drawScene);
}

/*
 * Dibuja un modelo específico.
 */
function drawModel(viewProjectionMatrix, agent, bufferInfo) {
  // Verificar que el agente tenga una posición válida
  if (!agent || !agent.position) {
    console.warn(`Agent ${agent.id} tiene una posición inválida.`);
    return;
  }

  // Crear matrices de transformación
  const translationMatrix = twgl.m4.translation(agent.position);
  const rotationX = twgl.m4.rotationX((agent.rotation[0] * Math.PI) / 180);
  const rotationY = twgl.m4.rotationY((agent.rotation[1] * Math.PI) / 180);
  const rotationZ = twgl.m4.rotationZ((agent.rotation[2] * Math.PI) / 180);
  const scaleMatrix = twgl.m4.scale(twgl.m4.identity(), [
    agent.scale[0],
    agent.scale[1],
    agent.scale[2],
  ]);

  // Combinar transformaciones
  let modelMatrix = twgl.m4.multiply(translationMatrix, rotationX);
  modelMatrix = twgl.m4.multiply(modelMatrix, rotationY);
  modelMatrix = twgl.m4.multiply(modelMatrix, rotationZ);
  modelMatrix = twgl.m4.multiply(modelMatrix, scaleMatrix);

  // Combinar con la matriz de vista-proyección
  const matrix = twgl.m4.multiply(viewProjectionMatrix, modelMatrix);

  // Establecer uniforms
  twgl.setUniforms(programInfo, {
    u_matrix: matrix,
    u_objectColor: agent.color || [1.0, 1.0, 1.0, 1.0],
  });

  // Dibujar el modelo
  twgl.drawBufferInfo(gl, bufferInfo);
}

/*
 * Configura la matriz de vista-proyección.
 */
function setupWorldView(gl) {
  const fov = (45 * Math.PI) / 180;
  const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
  const projectionMatrix = twgl.m4.perspective(fov, aspect, 1, 200);

  const target = [data.width / 2, 0, data.height / 2];
  const up = [0, 1, 0];
  const camPos = [
    cameraPosition.x + data.width / 2,
    cameraPosition.y,
    cameraPosition.z + data.height / 2,
  ];

  const cameraMatrix = twgl.m4.lookAt(camPos, target, up);
  const viewMatrix = twgl.m4.inverse(cameraMatrix);
  const viewProjectionMatrix = twgl.m4.multiply(projectionMatrix, viewMatrix);

  return viewProjectionMatrix;
}

/*
 * Configura la interfaz de usuario usando lil-gui.
 */
function setupUI() {
  const gui = new GUI();
  const posFolder = gui.addFolder("Posición de la Cámara:");
  posFolder.add(cameraPosition, "x", -50, 50).name("X");
  posFolder.add(cameraPosition, "y", -50, 50).name("Y");
  posFolder.add(cameraPosition, "z", -50, 50).name("Z");
  posFolder.open();
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
 * Inicia la aplicación.
 */
main();
