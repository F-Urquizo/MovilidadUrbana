"use strict";

/**
 * Importaciones necesarias para el proyecto.
 * - twgl.js: Biblioteca simplificada para trabajar con WebGL.
 * - lil-gui: Biblioteca para crear interfaces de usuario (GUI).
 * - starter_3D_lib.js: Librerías auxiliares para vectores y matrices.
 */
import * as twgl from "twgl.js";
import GUI from "lil-gui";
import { v3, m4 } from "./libs/starter_3D_lib.js"; // Asegúrate de ajustar la ruta según corresponda

/**
 * Clase Object3D
 * Representa cualquier objeto en la escena 3D con propiedades como posición, rotación, escala, color y tipo de modelo.
 */
class Object3D {
  /**
   * Constructor para crear un nuevo objeto 3D.
   * @param {string} id - Identificador único del objeto.
   * @param {Array} position - Posición inicial en [x, y, z].
   * @param {Array} rotation - Rotación inicial en [x, y, z] grados.
   * @param {Array} scale - Escala inicial en [x, y, z].
   * @param {Array} color - Color RGBA del objeto.
   * @param {string} modelType - Tipo de modelo para renderización.
   */
  constructor(
    id,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = [1, 1, 1],
    color = [0.5, 0.5, 0.5, 1.0],
    modelType = "low_building1" // Tipo de modelo por defecto
  ) {
    this.id = id;
    this.position = position;
    this.previousPosition = position.slice(); // Posición anterior para interpolación
    this.targetPosition = position.slice(); // Posición objetivo para movimiento
    this.stepPosition = [0, 0, 0]; // Incremento por frame para interpolación
    this.stepsLeft = 0; // Pasos restantes para completar el movimiento
    this.rotation = rotation;
    this.scale = scale;
    this.color = color;
    this.modelType = modelType; // Tipo de modelo para renderización
    this.matrix = m4.identity(); // Matriz de transformación
    this.emissiveColor = [0, 0, 0, 1.0]; // Color de emisión por defecto
  }

  /**
   * Inicia la interpolación hacia una nueva posición.
   * @param {Array} newPosition - Nueva posición objetivo en [x, y, z].
   * @param {number} totalSteps - Número total de pasos (frames) para completar el movimiento.
   */
  moveTo(newPosition, totalSteps) {
    this.targetPosition = newPosition.slice();
    this.stepPosition = [
      (this.targetPosition[0] - this.position[0]) / totalSteps,
      (this.targetPosition[1] - this.position[1]) / totalSteps,
      (this.targetPosition[2] - this.position[2]) / totalSteps,
    ];
    this.stepsLeft = totalSteps;
  }

  /**
   * Actualiza la posición del objeto en cada frame para lograr un movimiento suave.
   */
  updatePosition() {
    if (this.stepsLeft > 0) {
      this.position = [
        this.position[0] + this.stepPosition[0],
        this.position[1] + this.stepPosition[1],
        this.position[2] + this.stepPosition[2],
      ];
      this.stepsLeft--;
      if (this.stepsLeft === 0) {
        this.position = this.targetPosition.slice();
      }
    }
  }
}

/**
 * Configuración del servidor Flask.
 * Define la URI base para las solicitudes al servidor de agentes.
 */
const agent_server_uri = "http://localhost:8585/";

/**
 * Variables globales para almacenar agentes de diferentes tipos.
 */
const carAgents = {}; // Agentes Car por ID
const obstacleAgents = {}; // Agentes Obstacle (Edificios) por ID
const trafficLightAgents = {}; // Agentes Traffic_Light por ID
const destinationAgents = {}; // Agentes Destination por ID
const roadAgents = {}; // Agentes Road por ID

/**
 * Variables para WebGL y manejo de VAOs y BufferInfos.
 */
let gl, programInfo;
let carVao, carBufferInfo;
let obstacleVao1, obstacleBufferInfo1; // VAO y BufferInfo para low_building1
let obstacleVao2, obstacleBufferInfo2; // VAO y BufferInfo para low_building2
let trafficLightVao, trafficLightBufferInfo; // VAO y BufferInfo para semáforos
let houseVao, houseBufferInfo; // VAO y BufferInfo para Destinations (House)
let roadVao, roadBufferInfo; // VAO y BufferInfo para Roads

/**
 * Parámetros de la cámara con Proxy para monitorear cambios.
 */
const cameraPosition = new Proxy(
  { x: 0, y: 25, z: 25 }, // Valores iniciales de la cámara
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

/**
 * Parámetros de iluminación en la escena.
 */
let lightPosition = {
  x: 10, // Posición inicial en X
  y: 10, // Posición inicial en Y
  z: 10, // Posición inicial en Z
};
let lightAmbientColor = [0.3, 0.3, 0.3, 1.0]; // Color ambiental
let lightDiffuseColor = [1.0, 1.0, 1.0, 1.0]; // Color difuso
let lightSpecularColor = [1.0, 1.0, 1.0, 1.0]; // Color especular

/**
 * Datos iniciales enviados al servidor para inicializar los agentes.
 * Ajustamos el tamaño del mapa a un valor más pequeño para que el suelo no sea excesivamente grande.
 */
const data = { NAgents: 10, width: 20, height: 20 }; // Reducido de 100 a 20
let frameCount = 0; // Contador de frames para actualizar la escena

/**
 * Constantes para ajustar la posición de ciertos objetos en la escena.
 * Eliminamos el margen y la bajada para asegurar que no haya espacios innecesarios.
 */
const GROUND_MARGIN = 0; // Eliminamos el margen adicional
const ROAD_LOWERING = 0; // Eliminamos la bajada para alinear las calles directamente sobre el suelo
const TRAFFIC_LIGHT_ELEVATION = 0.5; // Elevación de semáforos sobre el suelo
const DESTINATION_HEIGHT_OFFSET = 0.4; // Offset para elevar las destinations

/**
 * Parámetros para la órbita de la luz (simula un sol o fuente de luz móvil).
 */
let lightOrbitRadius = 50; // Radio de la órbita de la luz
let lightOrbitHeight = 20; // Altura de la luz durante la órbita
let lightOrbitAngle = 0; // Ángulo inicial de la órbita de la luz
let lightOrbitSpeed = 0.3; // Velocidad de rotación de la luz (grados por frame)

/**
 * Control de rotación de la luz.
 * Si está habilitado, la luz orbitará alrededor de la escena.
 */
let lightRotationEnabled = true; // Inicialmente la rotación está activada

/**
 * Funciones Auxiliares
 */

/**
 * Genera un color aleatorio (usado para asignar colores únicos a coches).
 * @returns {Array} Color RGBA aleatorio.
 */
function getRandomColor() {
  return [Math.random(), Math.random(), Math.random(), 1.0];
}

/**
 * Convierte un array RGB a un string HEX.
 * @param {Array} rgbArray - Array con valores RGB [r, g, b].
 * @returns {string} Representación HEX del color.
 */
function rgbToHex(rgbArray) {
  const r = Math.round(rgbArray[0] * 255);
  const g = Math.round(rgbArray[1] * 255);
  const b = Math.round(rgbArray[2] * 255);
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Convierte un color HEX a un array RGBA.
 * @param {string} hex - String HEX del color.
 * @returns {Array} Array RGBA correspondiente.
 */
function hexToRgbA(hex) {
  const c = hex.replace("#", "").trim().toLowerCase();
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

/**
 * Calcula el ángulo de rotación (en grados) basado en la dirección de movimiento.
 * @param {number} dx - Componente X de la dirección de movimiento.
 * @param {number} dz - Componente Z de la dirección de movimiento.
 * @returns {number} Ángulo de rotación en grados.
 */
function computeYaw(dx, dz) {
  if (dx === 0 && dz === 0) {
    return 0; // Sin movimiento, mantener la rotación actual
  }
  const angleRad = Math.atan2(dx, dz); // Rotación alrededor del eje Y
  let angleDeg = (angleRad * 180) / Math.PI;
  angleDeg += 90; // Añadir 90 grados para corregir la dirección
  return angleDeg;
}

/**
 * Funciones para Cargar y Parsear OBJ
 */

/**
 * Carga un archivo OBJ desde una URL y lo parsea.
 * @param {string} url - URL del archivo OBJ.
 * @returns {Object|null} Objeto con datos de posición, normal e índices o null en caso de error.
 */
async function loadOBJ(url) {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Error HTTP! Estado: ${response.status}`);
    }

    const objText = await response.text();
    const parsedOBJ = parseOBJ(objText, url);

    if (parsedOBJ) {
      // OBJ cargado correctamente
    } else {
      console.error(`Error al parsear el OBJ desde ${url}.`);
    }

    return parsedOBJ;
  } catch (error) {
    console.error(`Error al cargar el archivo OBJ desde ${url}:`, error);
    return null;
  }
}

/**
 * Parsea el contenido de un archivo OBJ.
 * @param {string} objText - Contenido del archivo OBJ.
 * @param {string} url - URL del archivo OBJ (para mensajes de error).
 * @returns {Object|null} Objeto con datos de posición, normal e índices o null si está incompleto.
 */
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

      // Triangulación si es necesario (para polígonos con más de 3 vértices)
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
              normals.push(0, 0, 1); // Normal por defecto si no se especifica
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

  return {
    a_position: { numComponents: 3, data: positions },
    a_normal: { numComponents: 3, data: normals },
    indices: { numComponents: 1, data: indices },
  };
}

/**
 * Funciones para Obtener Datos desde el Servidor
 */

/**
 * Inicializa el modelo de agentes enviando una solicitud POST al servidor.
 * Crea y configura los agentes en función de los datos recibidos.
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

      // Limpiar diccionarios de agentes existentes
      Object.keys(carAgents).forEach((key) => delete carAgents[key]);
      Object.keys(obstacleAgents).forEach((key) => delete obstacleAgents[key]);
      Object.keys(trafficLightAgents).forEach(
        (key) => delete trafficLightAgents[key]
      );
      Object.keys(destinationAgents).forEach(
        (key) => delete destinationAgents[key]
      );
      Object.keys(roadAgents).forEach((key) => delete roadAgents[key]);

      /**
       * Creación de Agentes Car
       */
      if (result.car_agents) {
        result.car_agents.forEach((agent) => {
          carAgents[agent.id] = new Object3D(
            agent.id,
            [
              agent.x - data.width / 2, // Desplazamiento en X para centrar en el origen
              agent.y,
              agent.z - data.height / 2, // Desplazamiento en Z para centrar en el origen
            ],
            [0, 0, 0], // Sin rotación inicial
            [0.5, 0.5, 0.5], // Escala para coches
            getRandomColor(), // Asignar color único de coche
            "car" // Tipo de modelo para renderización
          );
        });
      }

      /**
       * Creación de Agentes Obstacle (Edificios)
       */
      if (result.obstacle_agents) {
        result.obstacle_agents.forEach((obstacle) => {
          // Asignar aleatoriamente entre low_building1 y low_building2
          const modelType =
            Math.random() < 0.5 ? "low_building1" : "low_building2";
          const obstacleColor = [0.08, 0.65, 0.73, 1.0]; // Color fijo de la paleta

          obstacleAgents[obstacle.id] = new Object3D(
            obstacle.id,
            [
              obstacle.x - data.width / 2, // Desplazamiento en X
              obstacle.y,
              obstacle.z - data.height / 2, // Desplazamiento en Z
            ],
            [0, 0, 0], // Sin rotación inicial
            [1, 1, 1], // Escala reducida para edificios
            obstacleColor, // Color fijo de la paleta
            modelType // Tipo de modelo para renderización
          );
        });
      }

      /**
       * Creación de Agentes Destination (Destinos)
       */
      if (result.destinations) {
        result.destinations.forEach((destinationData) => {
          destinationAgents[destinationData.id] = new Object3D(
            destinationData.id,
            [
              destinationData.x - data.width / 2,
              destinationData.y + DESTINATION_HEIGHT_OFFSET, // Elevación añadida
              destinationData.z - data.height / 2,
            ],
            [0, 0, 0], // Sin rotación inicial
            [0.7, 0.7, 0.7], // Escala para destinos
            [0, 0.93, 0.5, 1.0], // Verde fluorescente
            "house" // Tipo de modelo para renderización
          );
        });
      }

      /**
       * Creación de Agentes Traffic Light (Semáforos)
       */
      if (result.trafficLights) {
        result.trafficLights.forEach((light) => {
          const lightColor = light.state ? [0, 1, 0, 1] : [1, 0, 0, 1]; // Verde si state=True, rojo si False

          if (trafficLightAgents[light.id]) {
            // Actualizar posición y color de semáforos existentes
            trafficLightAgents[light.id].position = [
              light.x - data.width / 2,
              light.y + TRAFFIC_LIGHT_ELEVATION, // Elevación añadida
              light.z - data.height / 2,
            ];
            trafficLightAgents[light.id].color = lightColor;
            trafficLightAgents[light.id].emissiveColor = lightColor;
          } else {
            // Crear un nuevo semáforo con color y desplazamiento
            const newTrafficLight = new Object3D(
              light.id,
              [
                light.x - data.width / 2,
                light.y + TRAFFIC_LIGHT_ELEVATION, // Elevación añadida
                light.z - data.height / 2,
              ],
              [0, 0, 0], // Sin rotación inicial
              [0.3, 0.3, 0.3], // Escala para semáforos
              lightColor, // Color basado en estado
              "traffic_light" // Tipo de modelo para renderización
            );
            newTrafficLight.emissiveColor = lightColor; // Asignar color de emisión
            trafficLightAgents[light.id] = newTrafficLight;
          }
        });

        // Eliminar semáforos que ya no están presentes
        const currentLightIds = result.trafficLights.map((light) => light.id);
        Object.keys(trafficLightAgents).forEach((lightId) => {
          if (!currentLightIds.includes(lightId)) {
            delete trafficLightAgents[lightId];
          }
        });
      }

      /**
       * Creación de Agentes Road (Caminos)
       */
      if (result.roads) {
        result.roads.forEach((roadData) => {
          let rotationY = 0; // Rotación alrededor del eje Y en grados

          // Normalizar la dirección para evitar problemas con mayúsculas/minúsculas
          const direction = roadData.direction.trim().toLowerCase();

          // Determinar la rotación basada en la dirección
          switch (direction) {
            case "left":
              rotationY = 180; // Izquierda
              break;
            case "right":
              rotationY = 0; // Derecha
              break;
            case "up":
              rotationY = 90; // Arriba
              break;
            case "down":
              rotationY = -90; // Abajo
              break;
            default:
              rotationY = 0;
              console.warn(
                `Dirección desconocida para road ${roadData.id}: ${roadData.direction}`
              );
          }

          console.log(
            `Road ID: ${roadData.id}, Dirección: ${roadData.direction}, rotationY: ${rotationY}`
          );

          roadAgents[roadData.id] = new Object3D(
            roadData.id,
            [
              roadData.x - data.width / 2,
              roadData.y, // No se aplica bajada
              roadData.z - data.height / 2,
            ],
            [0, rotationY, 0], // Rotación inicial basada en la dirección
            [1.5, 1.5, 1.5], // Escala para roads
            [0.8, 0.8, 0.8, 1.0], // Gris claro
            "road" // Tipo de modelo para renderización
          );
        });

        // Eliminar roads que ya no están presentes
        const currentRoadIds = result.roads.map((road) => road.id);
        Object.keys(roadAgents).forEach((roadId) => {
          if (!currentRoadIds.includes(roadId)) {
            delete roadAgents[roadId];
          }
        });
      }

      /**
       * Actualizar el ancho y alto del mapa si es proporcionado por el servidor.
       */
      if (result.width !== undefined) {
        data.width = result.width;
      }
      if (result.height !== undefined) {
        data.height = result.height;
      }

      /**
       * Iniciar el bucle de dibujo después de configurar todos los agentes.
       */
      drawScene();
    }
  } catch (error) {
    console.error("Error al inicializar los agentes:", error);
  }
}

/**
 * Recupera las posiciones actuales de todos los agentes Car desde el servidor.
 * Actualiza o crea nuevos agentes en función de los datos recibidos.
 */
async function getAgents() {
  try {
    const response = await fetch(agent_server_uri + "getAgents");

    if (response.ok) {
      const result = await response.json();

      // Verificar si se recibieron posiciones de agentes
      if (result.positions) {
        result.positions.forEach((agentData) => {
          const agentId = agentData.id;
          if (carAgents[agentId]) {
            // Obtener la posición anterior
            const previousPos = carAgents[agentId].position.slice();
            const newPos = [
              agentData.x - data.width / 2, // Desplazamiento en X para centrar en el origen
              agentData.y,
              agentData.z - data.height / 2, // Desplazamiento en Z para centrar en el origen
            ];

            // Calcular la dirección de movimiento
            const direction = [
              newPos[0] - previousPos[0],
              newPos[1] - previousPos[1],
              newPos[2] - previousPos[2],
            ];

            // Calcular la magnitud de movimiento
            const magnitude = Math.sqrt(
              direction[0] * direction[0] +
                direction[1] * direction[1] +
                direction[2] * direction[2]
            );

            if (magnitude > 0.001) {
              // Calcular el ángulo de rotación basado en la dirección y añadir 90 grados
              const angle = computeYaw(direction[0], direction[2]) + 90;

              // Actualizar la rotación del coche
              carAgents[agentId].rotation = [0, angle, 0];

              // Iniciar la interpolación hacia la nueva posición
              carAgents[agentId].moveTo(newPos, 30); // Mover en 30 pasos (frames)
            } else {
              // El coche está detenido; actualizar la posición sin rotación
              carAgents[agentId].position = newPos.slice();
              carAgents[agentId].previousPosition = newPos.slice();
            }
          } else {
            // Nuevo agente, asignar color único y crear con desplazamiento
            carAgents[agentId] = new Object3D(
              agentId,
              [
                agentData.x - data.width / 2, // Desplazamiento en X
                agentData.y,
                agentData.z - data.height / 2, // Desplazamiento en Z
              ],
              [0, 0, 0], // Sin rotación inicial
              [0.5, 0.5, 0.5], // Escala para coches
              getRandomColor(), // Asignar color único de coche
              "car" // Tipo de modelo para renderización
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

/**
 * Recupera las posiciones actuales de todos los agentes Obstacle (Edificios) desde el servidor.
 * Actualiza o crea nuevos agentes en función de los datos recibidos.
 */
async function getObstacles() {
  try {
    const response = await fetch(agent_server_uri + "getObstacles");

    if (response.ok) {
      const result = await response.json();

      // Verificar si se recibieron posiciones de obstáculos
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
            // Nuevo edificio, asignar color fijo y crear con desplazamiento y modelType aleatorio
            const modelType =
              Math.random() < 0.5 ? "low_building1" : "low_building2";
            const obstacleColor = [0.08, 0.65, 0.73, 1.0]; // Color fijo

            obstacleAgents[obstacleId] = new Object3D(
              obstacleId,
              [
                obstacleData.x - data.width / 2, // Desplazamiento en X
                obstacleData.y,
                obstacleData.z - data.height / 2, // Desplazamiento en Z
              ],
              [0, 0, 0], // Sin rotación inicial
              [1, 1, 1], // Escala reducida para edificios
              obstacleColor, // Color fijo
              modelType // Tipo de modelo para renderización
            );
          }
        });

        // Eliminar edificios que ya no están presentes
        const currentObstacleIds = result.positions.map(
          (obstacle) => obstacle.id
        );
        Object.keys(obstacleAgents).forEach((obstacleId) => {
          if (!currentObstacleIds.includes(obstacleId)) {
            delete obstacleAgents[obstacleId];
          }
        });
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

/**
 * Recupera las posiciones actuales de los semáforos desde el servidor.
 * Actualiza o crea nuevos agentes en función de los datos recibidos.
 */
async function getTrafficLights() {
  try {
    const response = await fetch(agent_server_uri + "getTrafficLights");

    if (response.ok) {
      const result = await response.json();

      // Verificar si se recibieron datos de semáforos
      if (result.trafficLights) {
        result.trafficLights.forEach((lightData) => {
          const lightId = lightData.id;
          const lightColor = lightData.state ? [0, 1, 0, 1] : [1, 0, 0, 1]; // Verde si state=True, rojo si False

          if (trafficLightAgents[lightId]) {
            // Actualizar posición y color de semáforos existentes
            trafficLightAgents[lightId].position = [
              lightData.x - data.width / 2,
              lightData.y + TRAFFIC_LIGHT_ELEVATION, // Elevación añadida
              lightData.z - data.height / 2,
            ];
            trafficLightAgents[lightId].color = lightColor;
            trafficLightAgents[lightId].emissiveColor = lightColor;
          } else {
            // Crear un nuevo semáforo con color y desplazamiento
            const newTrafficLight = new Object3D(
              lightId,
              [
                lightData.x - data.width / 2,
                lightData.y + TRAFFIC_LIGHT_ELEVATION, // Elevación añadida
                lightData.z - data.height / 2,
              ],
              [0, 0, 0], // Sin rotación inicial
              [0.3, 0.3, 0.3], // Escala para semáforos
              lightColor, // Color basado en estado
              "traffic_light" // Tipo de modelo para renderización
            );
            newTrafficLight.emissiveColor = lightColor; // Asignar color de emisión
            trafficLightAgents[lightId] = newTrafficLight;
          }
        });

        // Eliminar semáforos que ya no están presentes
        const currentLightIds = result.trafficLights.map((light) => light.id);
        Object.keys(trafficLightAgents).forEach((lightId) => {
          if (!currentLightIds.includes(lightId)) {
            delete trafficLightAgents[lightId];
          }
        });
      } else {
        console.warn("No se encontraron semáforos en la respuesta.");
      }
    } else {
      const errorResult = await response.json();
      console.error(
        `Error al recuperar semáforos. Estado: ${response.status}`,
        errorResult
      );
    }
  } catch (error) {
    console.error("Error al recuperar semáforos:", error);
  }
}

/**
 * Recupera las posiciones actuales de los agentes Destination desde el servidor.
 * Actualiza o crea nuevos agentes en función de los datos recibidos.
 */
async function getDestinations() {
  try {
    const response = await fetch(agent_server_uri + "getDestinations");

    if (response.ok) {
      const result = await response.json();

      // Verificar si se recibieron posiciones de destinos
      if (result.positions) {
        result.positions.forEach((destinationData) => {
          const destinationId = destinationData.id;
          if (destinationAgents[destinationId]) {
            // Actualizar posición si el destino ya existe
            destinationAgents[destinationId].position = [
              destinationData.x - data.width / 2,
              destinationData.y + DESTINATION_HEIGHT_OFFSET, // Elevación añadida
              destinationData.z - data.height / 2,
            ];
          } else {
            // Crear un nuevo agente Destination con color verde fluorescente
            destinationAgents[destinationId] = new Object3D(
              destinationData.id,
              [
                destinationData.x - data.width / 2,
                destinationData.y + DESTINATION_HEIGHT_OFFSET, // Elevación añadida
                destinationData.z - data.height / 2,
              ],
              [0, 0, 0], // Sin rotación inicial
              [0.7, 0.7, 0.7], // Escala para destinos
              [0, 0.93, 0.5, 1.0], // Verde fluorescente
              "house" // Tipo de modelo para renderización
            );
          }
        });

        // Eliminar destinos que ya no están presentes
        const currentDestinationIds = result.positions.map(
          (destination) => destination.id
        );
        Object.keys(destinationAgents).forEach((destinationId) => {
          if (!currentDestinationIds.includes(destinationId)) {
            delete destinationAgents[destinationId];
          }
        });
      } else {
        console.warn(
          "No se encontraron posiciones de destinos en la respuesta."
        );
      }
    } else {
      const errorResult = await response.json();
      console.error(
        `Error al recuperar destinos. Estado: ${response.status}`,
        errorResult
      );
    }
  } catch (error) {
    console.error("Error al recuperar destinos:", error);
  }
}

/**
 * Recupera las posiciones actuales de los caminos (Roads) desde el servidor.
 * Actualiza o crea nuevos agentes en función de los datos recibidos.
 */
async function getRoads() {
  try {
    const response = await fetch(agent_server_uri + "getRoads");

    if (response.ok) {
      const result = await response.json();
      console.log("Respuesta de /getRoads:", result); // Log para depuración

      // Verificar si se recibieron posiciones de caminos
      if (result.positions) {
        result.positions.forEach((roadData) => {
          const roadId = roadData.id;
          let rotationY = 0; // Rotación alrededor del eje Y en grados

          // Normalizar la dirección para evitar problemas con mayúsculas/minúsculas
          const direction = roadData.direction.trim().toLowerCase();

          // Determinar la rotación basada en la dirección
          switch (direction) {
            case "left":
              rotationY = 180; // Izquierda
              break;
            case "right":
              rotationY = 0; // Derecha
              break;
            case "up":
              rotationY = 90; // Arriba
              break;
            case "down":
              rotationY = -90; // Abajo
              break;
            default:
              rotationY = 0;
              console.warn(
                `Dirección desconocida para road ${roadId}: ${roadData.direction}`
              );
          }

          console.log(
            `Road ID: ${roadId}, Dirección: ${roadData.direction}, rotationY: ${rotationY}`
          );

          roadAgents[roadData.id] = new Object3D(
            roadData.id,
            [
              roadData.x - data.width / 2,
              roadData.y, // No se aplica bajada
              roadData.z - data.height / 2,
            ],
            [0, rotationY, 0], // Rotación inicial basada en la dirección
            [1.5, 1.5, 1.5], // Escala para roads
            [0.8, 0.8, 0.8, 1.0], // Gris claro
            "road" // Tipo de modelo para renderización
          );
        });

        // Eliminar roads que ya no están presentes
        const currentRoadIds = result.positions.map((road) => road.id);
        Object.keys(roadAgents).forEach((roadId) => {
          if (!currentRoadIds.includes(roadId)) {
            delete roadAgents[roadId];
          }
        });
      } else {
        console.warn("No se encontraron caminos en la respuesta.");
      }
    } else {
      const errorResult = await response.json();
      console.error(
        `Error al recuperar caminos. Estado: ${response.status}`,
        errorResult
      );
    }
  } catch (error) {
    console.error("Error al recuperar caminos:", error);
  }
}

/**
 * Prepara los datos de los semáforos para enviarlos a los shaders.
 * @returns {Object} Objeto con posiciones y colores de los semáforos.
 */
function prepareTrafficLightData() {
  const trafficLightsPositions = [];
  const trafficLightsColors = [];

  Object.values(trafficLightAgents).forEach((light) => {
    trafficLightsPositions.push(light.position);
    trafficLightsColors.push(light.color);
  });

  // Limitar el número de semáforos a MAX_TRAFFIC_LIGHTS para optimización
  const MAX_TRAFFIC_LIGHTS = 100;
  return {
    positions: trafficLightsPositions.slice(0, MAX_TRAFFIC_LIGHTS),
    colors: trafficLightsColors.slice(0, MAX_TRAFFIC_LIGHTS),
  };
}

/**
 * Carga el contenido de un shader desde una URL.
 * @param {string} url - URL del archivo del shader.
 * @returns {string|null} Contenido del shader o null en caso de error.
 */
async function loadShader(url) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(
        `Error al cargar el shader desde ${url}: ${response.statusText}`
      );
    }
    return await response.text();
  } catch (error) {
    console.error(error);
    return null;
  }
}

/**
 * Función Principal para Iniciar la Aplicación.
 * Carga los shaders y modelos, configura VAOs y BufferInfos, y inicializa los agentes.
 */
async function main() {
  // Seleccionar el elemento canvas del DOM
  const canvas = document.querySelector("canvas");
  if (!canvas) {
    console.error("Elemento canvas no encontrado en el HTML.");
    return;
  }

  // Obtener el contexto WebGL2
  gl = canvas.getContext("webgl2");
  if (!gl) {
    console.error("WebGL2 no es soportado en este navegador.");
    return;
  }

  /**
   * Cargar los shaders desde archivos separados.
   * Es esencial que los archivos vertex.glsl y fragment.glsl existan en la carpeta ./shaders/.
   */
  const [vsSource, fsSource] = await Promise.all([
    loadShader("./shaders/vertex.glsl"),
    loadShader("./shaders/fragment.glsl"),
  ]);

  if (!vsSource || !fsSource) {
    console.error("No se pudieron cargar los shaders.");
    return;
  }

  // Crear el programa de shaders utilizando twgl.js
  programInfo = twgl.createProgramInfo(gl, [vsSource, fsSource]);

  /**
   * Definir las URLs de los modelos OBJ.
   * Asegúrate de que estos archivos existan en la carpeta ./models/.
   */
  const [
    carObjURL,
    lowBuildingObjURL1,
    lowBuildingObjURL2,
    cubeObjURL,
    houseObjURL,
    streetObjURL, // Añadido para Roads
    // planeObjURL eliminado
  ] = [
    "./models/car.obj",
    "./models/low_building.obj",
    "./models/low_building2.obj",
    "./models/cube.obj",
    "./models/house.obj", // Añadido para Destinations
    "./models/street.obj", // Añadido para Roads
    // "./models/plane.obj", // Eliminado
  ];

  /**
   * Cargar los modelos: coches, edificios (2 tipos), semáforos, casas (destinations), roads.
   */
  const [
    loadedCarArrays,
    loadedLowBuildingArrays1,
    loadedLowBuildingArrays2,
    loadedCubeArrays,
    loadedHouseArrays, // Cargamos house.obj
    loadedStreetArrays, // Cargamos street.obj
    // loadedPlaneObj eliminado
  ] = await Promise.all([
    loadOBJ(carObjURL),
    loadOBJ(lowBuildingObjURL1), // Cargar low_building.obj para edificios
    loadOBJ(lowBuildingObjURL2), // Cargar low_building2.obj para edificios alternativos
    loadOBJ(cubeObjURL), // Cargar cube.obj para semáforos
    loadOBJ(houseObjURL), // Cargar house.obj para destinos
    loadOBJ(streetObjURL), // Cargar street.obj para roads
    // loadOBJ(planeObjURL), // Eliminado
  ]);

  // Verificar que todos los modelos se cargaron correctamente
  if (
    !loadedCarArrays ||
    !loadedLowBuildingArrays1 ||
    !loadedLowBuildingArrays2 ||
    !loadedCubeArrays ||
    !loadedHouseArrays || // Verificar house.obj
    !loadedStreetArrays // Verificar street.obj
    // !loadedPlaneArrays eliminado
  ) {
    console.error("Uno o más modelos no se cargaron correctamente.");
    return;
  }

  /**
   * Crear VAOs y BufferInfos para cada tipo de modelo.
   */

  // Coches
  carBufferInfo = twgl.createBufferInfoFromArrays(gl, loadedCarArrays);
  carVao = twgl.createVAOFromBufferInfo(gl, programInfo, carBufferInfo);

  // Edificios - low_building.obj
  obstacleBufferInfo1 = twgl.createBufferInfoFromArrays(
    gl,
    loadedLowBuildingArrays1
  );
  obstacleVao1 = twgl.createVAOFromBufferInfo(
    gl,
    programInfo,
    obstacleBufferInfo1
  );

  // Edificios - low_building2.obj
  obstacleBufferInfo2 = twgl.createBufferInfoFromArrays(
    gl,
    loadedLowBuildingArrays2
  );
  obstacleVao2 = twgl.createVAOFromBufferInfo(
    gl,
    programInfo,
    obstacleBufferInfo2
  );

  // Semáforos
  trafficLightBufferInfo = twgl.createBufferInfoFromArrays(
    gl,
    loadedCubeArrays
  );
  trafficLightVao = twgl.createVAOFromBufferInfo(
    gl,
    programInfo,
    trafficLightBufferInfo
  );

  // Destinations - house.obj
  houseBufferInfo = twgl.createBufferInfoFromArrays(gl, loadedHouseArrays);
  houseVao = twgl.createVAOFromBufferInfo(gl, programInfo, houseBufferInfo);

  // Roads - street.obj
  roadBufferInfo = twgl.createBufferInfoFromArrays(gl, loadedStreetArrays);
  roadVao = twgl.createVAOFromBufferInfo(gl, programInfo, roadBufferInfo);

  /**
   * Configurar la interfaz de usuario usando lil-gui.
   */
  setupUI();

  /**
   * Inicializar los agentes desde el servidor.
   */
  await initAgentsModel();
}

/**
 * Función para Dibujar la Escena.
 * Renderiza todos los agentes y objetos en la escena.
 */
function drawScene() {
  /**
   * Actualización de la posición de la luz para animación de órbita.
   * Si la rotación de la luz está habilitada, actualiza su posición para simular una órbita.
   */
  if (lightRotationEnabled) {
    // Actualizar el ángulo de órbita de la luz
    lightOrbitAngle += lightOrbitSpeed;
    if (lightOrbitAngle >= 360) {
      lightOrbitAngle -= 360;
    }

    // Convertir el ángulo a radianes para cálculos trigonométricos
    const lightOrbitAngleRad = (lightOrbitAngle * Math.PI) / 180;

    // Calcular la nueva posición de la luz
    lightPosition.x = lightOrbitRadius * Math.cos(lightOrbitAngleRad);
    lightPosition.z = lightOrbitRadius * Math.sin(lightOrbitAngleRad);
    lightPosition.y = lightOrbitHeight; // Mantener la altura constante
  }

  /**
   * Redimensionar el canvas para que coincida con el tamaño de visualización.
   * Esto asegura que el contenido se escale correctamente al cambiar el tamaño de la ventana.
   */
  twgl.resizeCanvasToDisplaySize(gl.canvas);

  // Establecer el viewport para que coincida con el tamaño del canvas
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  /**
   * Configurar el entorno de renderizado:
   * - Establecer el color de borrado (fondo).
   * - Habilitar la prueba de profundidad para manejar correctamente la superposición de objetos.
   * - Deshabilitar el culling de caras para evitar que algunas caras no se rendericen.
   */
  gl.clearColor(0.2, 0.2, 0.2, 1); // Color de fondo gris oscuro
  gl.enable(gl.DEPTH_TEST); // Habilitar prueba de profundidad
  gl.disable(gl.CULL_FACE); // Deshabilitar culling de caras

  // Borrar los buffers de color y profundidad
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Usar el programa de shaders cargado
  gl.useProgram(programInfo.program);

  /**
   * Configurar la matriz de vista-proyección y obtener la posición de la cámara.
   */
  const { viewProjectionMatrix, cameraPos } = setupWorldView(gl);

  /**
   * Preparar los datos de los semáforos para los shaders.
   * Esto incluye posiciones y colores que serán utilizados en el shader para la iluminación.
   */
  const trafficLightData = prepareTrafficLightData();
  const trafficLightsPositionsFlat = trafficLightData.positions.flat();
  const trafficLightsColorsFlat = trafficLightData.colors.flat();
  const trafficLightsCount = trafficLightData.positions.length;

  /**
   * Configurar los uniformes globales de iluminación que serán utilizados en los shaders.
   */
  const globalUniforms = {
    u_viewWorldPosition: cameraPos,
    u_lightWorldPosition: [lightPosition.x, lightPosition.y, lightPosition.z],
    u_ambientLight: lightAmbientColor,
    u_diffuseLight: lightDiffuseColor,
    u_specularLight: lightSpecularColor,
    u_numTrafficLights: trafficLightsCount,
    u_trafficLightPositions: trafficLightsPositionsFlat,
    u_trafficLightColors: trafficLightsColorsFlat,
  };

  // Establecer los uniformes globales en el shader
  twgl.setUniforms(programInfo, globalUniforms);

  /**
   * Actualizar las posiciones de los agentes para movimiento suave.
   * Esto asegura que los objetos se muevan de manera interpolada entre frames.
   */
  Object.values(carAgents).forEach((car) => {
    car.updatePosition();
  });

  /**
   * Dibujar Agentes Car.
   * Cada coche se dibuja utilizando su VAO y BufferInfo correspondiente.
   */
  if (carVao && carBufferInfo) {
    gl.bindVertexArray(carVao);
    Object.values(carAgents).forEach((car) => {
      drawModel(viewProjectionMatrix, car, carBufferInfo, "car");
    });
  }

  /**
   * Dibujar Edificios (obstacleAgents).
   * Se manejan dos tipos de edificios, cada uno con su propio VAO y BufferInfo.
   */
  if (
    obstacleVao1 &&
    obstacleBufferInfo1 &&
    obstacleVao2 &&
    obstacleBufferInfo2
  ) {
    Object.values(obstacleAgents).forEach((obstacle) => {
      if (obstacle.modelType === "low_building1") {
        gl.bindVertexArray(obstacleVao1);
        drawModel(
          viewProjectionMatrix,
          obstacle,
          obstacleBufferInfo1,
          "obstacle"
        );
      } else if (obstacle.modelType === "low_building2") {
        gl.bindVertexArray(obstacleVao2);
        drawModel(
          viewProjectionMatrix,
          obstacle,
          obstacleBufferInfo2,
          "obstacle"
        );
      }
    });
  }

  /**
   * Dibujar Semáforos.
   * Cada semáforo se dibuja utilizando su VAO y BufferInfo correspondiente.
   */
  if (trafficLightVao && trafficLightBufferInfo) {
    gl.bindVertexArray(trafficLightVao); // Usar VAO de cube.obj
    Object.values(trafficLightAgents).forEach((light) => {
      drawModel(
        viewProjectionMatrix,
        light,
        trafficLightBufferInfo,
        "traffic_light"
      );
    });
  }

  /**
   * Dibujar Destinos (House).
   * Cada destino se dibuja utilizando su VAO y BufferInfo correspondiente.
   */
  if (houseVao && houseBufferInfo) {
    gl.bindVertexArray(houseVao);
    Object.values(destinationAgents).forEach((destination) => {
      drawModel(viewProjectionMatrix, destination, houseBufferInfo, "house"); // Tipo de modelo para House
    });
  }

  /**
   * Dibujar Roads (Caminos).
   * Cada camino se dibuja utilizando su VAO y BufferInfo correspondiente.
   */
  if (roadVao && roadBufferInfo) {
    gl.bindVertexArray(roadVao);
    Object.values(roadAgents).forEach((road) => {
      drawModel(viewProjectionMatrix, road, roadBufferInfo, "road"); // Tipo de modelo para Road
    });
  }

  // Incrementar el contador de frames para controlar la frecuencia de actualización
  frameCount++;

  /**
   * Actualizar la escena cada 30 frames.
   * Esto reduce la carga al servidor al no enviar actualizaciones en cada frame.
   */
  if (frameCount % 30 === 0) {
    frameCount = 0;
    update(); // Actualizar agentes desde el servidor
  }

  // Solicitar el siguiente frame para continuar el bucle de dibujo
  requestAnimationFrame(drawScene);
}

/**
 * Dibuja un modelo específico en la escena.
 * @param {Array} viewProjectionMatrix - Matriz de vista-proyección.
 * @param {Object3D} agent - Agente que representa el modelo a dibujar.
 * @param {Object} bufferInfo - BufferInfo del modelo.
 * @param {string} type - Tipo de modelo (car, obstacle, traffic_light, house, road).
 */
function drawModel(viewProjectionMatrix, agent, bufferInfo, type) {
  if (!agent || !agent.position) {
    console.warn(`Agent ${agent.id} tiene una posición inválida.`);
    return;
  }

  /**
   * Crear matrices de transformación para el modelo:
   * - translationMatrix: Mueve el modelo a su posición.
   * - rotationX, rotationY, rotationZ: Aplica rotaciones en los ejes X, Y y Z.
   * - scaleMatrix: Escala el modelo según las propiedades del agente.
   */
  const translationMatrix = m4.translation(agent.position);
  const rotationX = m4.rotationX((agent.rotation[0] * Math.PI) / 180);
  const rotationY = m4.rotationY((agent.rotation[1] * Math.PI) / 180);
  const rotationZ = m4.rotationZ((agent.rotation[2] * Math.PI) / 180);
  const scaleMatrix = m4.scale([
    agent.scale[0],
    agent.scale[1],
    agent.scale[2],
  ]);

  // Combinar las transformaciones en una matriz global
  let u_world = m4.multiply(translationMatrix, rotationX);
  u_world = m4.multiply(u_world, rotationY);
  u_world = m4.multiply(u_world, rotationZ);
  u_world = m4.multiply(u_world, scaleMatrix);

  const u_worldInverseTransform = m4.transpose(m4.inverse(u_world));
  const u_worldViewProjection = m4.multiply(viewProjectionMatrix, u_world);

  /**
   * Asignar colores y propiedades específicas según el tipo de modelo.
   * Esto incluye colores ambientales, difusos, especulares y de emisión.
   */
  let ambientColor, diffuseColor, emissiveColor;
  let modelTypeUniform = 0; // Default: generic

  switch (type) {
    case "traffic_light":
      ambientColor = agent.color;
      diffuseColor = agent.color;
      emissiveColor = agent.emissiveColor; // Luz propia del semáforo
      break;
    case "car":
      ambientColor = agent.color;
      diffuseColor = agent.color;
      emissiveColor = [0, 0, 0, 1.0]; // Sin emisión
      break;
    case "obstacle":
      ambientColor = agent.color;
      diffuseColor = agent.color;
      emissiveColor = [0, 0, 0, 1.0]; // Sin emisión
      break;
    case "house":
      ambientColor = agent.color; // Verde fluorescente
      diffuseColor = agent.color;
      emissiveColor = [0, 0, 0, 1.0]; // Sin emisión
      break;
    case "road":
      ambientColor = agent.color; // Gris claro
      diffuseColor = agent.color;
      emissiveColor = [0, 0, 0, 1.0]; // Sin emisión
      break;
    default:
      ambientColor = [1.0, 1.0, 1.0, 1.0];
      diffuseColor = [1.0, 1.0, 1.0, 1.0];
      emissiveColor = [0, 0, 0, 1.0];
  }

  /**
   * Configurar los uniformes del modelo que serán enviados al shader.
   */
  const modelUniforms = {
    u_world,
    u_worldInverseTransform,
    u_worldViewProjection,
    u_ambientColor: ambientColor,
    u_diffuseColor: diffuseColor,
    u_specularColor: [1.0, 1.0, 1.0, 1.0], // Color especular blanco
    u_shininess: 50.0, // Brillo especular
    u_emissiveColor: emissiveColor, // Color de emisión
    u_modelType: modelTypeUniform, // Tipo de modelo para manejar en el shader
  };

  // Establecer los uniformes del modelo en el shader
  twgl.setUniforms(programInfo, modelUniforms);

  // Dibujar el modelo usando los datos del bufferInfo
  twgl.drawBufferInfo(gl, bufferInfo);
}

/**
 * Configura la matriz de vista-proyección.
 * Calcula las matrices de proyección y vista basadas en la posición de la cámara.
 * @param {WebGLRenderingContext} gl - Contexto WebGL.
 * @returns {Object} Objeto con la matriz de vista-proyección y la posición de la cámara.
 */
function setupWorldView(gl) {
  const fov = (45 * Math.PI) / 180; // Campo de visión de 45 grados
  const aspect = gl.canvas.clientWidth / gl.canvas.clientHeight;
  const projectionMatrix = m4.perspective(fov, aspect, 1, 200);

  // Definir el objetivo (target) al origen
  const center = [0, 0, 0]; // Centrado en el origen
  const up = [0, 1, 0]; // Vector up

  // Posición de la cámara (absoluta)
  const camPos = [cameraPosition.x, cameraPosition.y, cameraPosition.z];

  // Log de la posición actual de la cámara para depuración
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

/**
 * Configura la interfaz de usuario usando lil-gui.
 * Añade controles para la cámara, iluminación y otros parámetros.
 */
function setupUI() {
  const gui = new GUI();

  /**
   * Controles de Posición de la Cámara
   * Permite al usuario ajustar la posición de la cámara en los ejes X, Y y Z.
   */
  const cameraFolder = gui.addFolder("Posición de la Cámara");

  cameraFolder
    .add(cameraPosition, "x", -50, 50, 0.1) // Paso reducido a 0.1 para mayor precisión
    .name("Posición X");
  cameraFolder.add(cameraPosition, "y", -50, 50, 0.1).name("Posición Y");
  cameraFolder.add(cameraPosition, "z", -50, 50, 0.1).name("Posición Z");

  cameraFolder.open(); // Abrir la carpeta por defecto

  /**
   * Controles de Iluminación
   * Permite al usuario ajustar los colores de iluminación ambiental, difusa y especular.
   */
  const lightFolder = gui.addFolder("Iluminación");

  lightFolder
    .addColor({ ambient: rgbToHex(lightAmbientColor) }, "ambient")
    .name("Ambiental")
    .onChange((value) => {
      lightAmbientColor = hexToRgbA(value);
    });

  lightFolder
    .addColor({ diffuse: rgbToHex(lightDiffuseColor) }, "diffuse")
    .name("Difusa")
    .onChange((value) => {
      lightDiffuseColor = hexToRgbA(value);
    });

  lightFolder
    .addColor({ specular: rgbToHex(lightSpecularColor) }, "specular")
    .name("Especular")
    .onChange((value) => {
      lightSpecularColor = hexToRgbA(value);
    });

  lightFolder.open();

  /**
   * Controles de Posición de la Luz
   * Permite al usuario ajustar manualmente la posición de la luz.
   * Estos controles se deshabilitan si la rotación de la luz está habilitada.
   */
  const lightPositionFolder = gui.addFolder("Posición de la Luz");

  const lightPosControls = {
    x: lightPosition.x,
    y: lightPosition.y,
    z: lightPosition.z,
  };

  const posXControl = lightPositionFolder
    .add(lightPosition, "x", -50, 50, 1)
    .name("Posición X")
    .listen();
  const posYControl = lightPositionFolder
    .add(lightPosition, "y", -50, 50, 1)
    .name("Posición Y")
    .listen();
  const posZControl = lightPositionFolder
    .add(lightPosition, "z", -50, 50, 1)
    .name("Posición Z")
    .listen();

  lightPositionFolder.open();

  /**
   * Controles de Órbita de la Luz
   * Permite al usuario ajustar parámetros de la órbita de la luz, como velocidad, radio y altura.
   */
  const lightOrbitFolder = gui.addFolder("Órbita de la Luz");

  // Control de velocidad de la órbita de la luz
  lightOrbitFolder
    .add({ speed: lightOrbitSpeed }, "speed", 0, 5, 0.1)
    .name("Velocidad")
    .onChange((value) => {
      lightOrbitSpeed = value;
    });

  // Control de radio de la órbita de la luz
  lightOrbitFolder
    .add({ radius: lightOrbitRadius }, "radius", 10, 100, 1)
    .name("Radio")
    .onChange((value) => {
      lightOrbitRadius = value;
    });

  // Control de altura de la luz
  lightOrbitFolder
    .add({ height: lightOrbitHeight }, "height", 0, 50, 1)
    .name("Altura")
    .onChange((value) => {
      lightOrbitHeight = value;
    });

  lightOrbitFolder.open();

  /**
   * Control de Rotación de la Luz
   * Permite al usuario habilitar o deshabilitar la rotación de la luz.
   * Si está habilitada, se deshabilitan los controles de posición manual de la luz.
   */
  const rotationControl = {
    rotarLuz: lightRotationEnabled,
  };

  const rotationControlGUI = gui
    .add(rotationControl, "rotarLuz")
    .name("Rotar Luz")
    .onChange((value) => {
      lightRotationEnabled = value;
      // Habilitar o deshabilitar los controles de posición de la luz
      posXControl.enable(!lightRotationEnabled);
      posYControl.enable(!lightRotationEnabled);
      posZControl.enable(!lightRotationEnabled);
    });

  // Inicialmente, si la rotación está activada, deshabilitar los controles de posición
  if (lightRotationEnabled) {
    posXControl.disable();
    posYControl.disable();
    posZControl.disable();
  }
}

/**
 * Actualiza las posiciones de los agentes enviando una solicitud al servidor.
 * Envía una solicitud POST con pasos para avanzar la simulación y actualiza los agentes.
 */
async function update() {
  try {
    const response = await fetch(agent_server_uri + "update", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ steps: 1 }),
    });

    if (response.ok) {
      // Recuperar y actualizar todos los tipos de agentes
      await Promise.all([
        getAgents(),
        getObstacles(),
        getTrafficLights(), // Actualizar semáforos
        getDestinations(), // Actualizar destinos
        getRoads(), // Actualizar caminos
      ]);

      // No se necesita actualizar la escala del suelo ya que ha sido eliminado
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

/**
 * Inicia la aplicación cargando los shaders y modelos, configurando VAOs y BufferInfos,
 * y luego inicializa los agentes desde el servidor.
 */
main();
