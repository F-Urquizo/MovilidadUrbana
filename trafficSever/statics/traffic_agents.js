"use strict";

import * as twgl from "twgl.js";
import GUI from "lil-gui";

// Vertex Shader
const vsGLSL = `#version 300 es
precision highp float;

in vec4 a_position;
in vec4 a_color;
in vec3 a_normal;

uniform mat4 u_matrix;

out vec4 v_color;
out vec3 v_normal;

void main() {
    gl_Position = u_matrix * a_position;
    v_color = a_color;
    v_normal = mat3(u_matrix) * a_normal;
}
`;

// Fragment Shader
const fsGLSL = `#version 300 es
precision highp float;

in vec4 v_color;
in vec3 v_normal;
out vec4 outColor;

uniform vec3 u_lightDirection;

void main() {
    float light = max(dot(normalize(v_normal), normalize(u_lightDirection)), 0.0);
    vec4 shadedColor = v_color * light;
    outColor = shadedColor;
}
`;

// Object3D Classes
class Object3D {
  constructor(
    id,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = [2, 2, 2]
  ) {
    this.id = id;
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
    this.matrix = twgl.m4.identity();
  }
}

class Object3DCar {
  constructor(
    id,
    position = [0, 0, 0],
    rotation = [0, 0, 0],
    scale = [1, 1, 1]
  ) {
    this.id = id;
    this.position = position;
    this.rotation = rotation;
    this.scale = scale;
    this.matrix = twgl.m4.identity();
  }
}

class TrafficLight3D {
  constructor(id, position = [0, 0, 0], state = "Red") {
    this.id = id;
    this.position = position;
    this.state = state;
    this.matrix = twgl.m4.identity();
  }
}

const agent_server_uri = "http://localhost:8585/";

let gl, programInfo;
let carVao, carBufferInfo;
let obstacleVao, obstacleBufferInfo;
let squareVao, squareBufferInfo;
const carAgents = [];
const obstacleAgents = [];
const squareAgents = [];
const cameraPosition = { x: 0, y: 9, z: 9 };
const data = { NAgents: 1, width: 28, height: 28 };
let frameCount = 0;

// Predefined Colors
const predefinedColors = [
  [1.0, 0.0, 0.0, 1.0], // Red
  [0.0, 0.0, 1.0, 1.0], // Blue
  [0.0, 1.0, 0.0, 1.0], // Green
  [1.0, 0.0, 1.0, 1.0], // Pink
  [1.0, 1.0, 0.0, 1.0], // Yellow
  [1.0, 0.5, 0.0, 1.0], // Orange
];

// Function to get random color
function getRandomPredefinedColor() {
  const randomIndex = Math.floor(Math.random() * predefinedColors.length);
  return predefinedColors[randomIndex];
}

// Load OBJ File
async function loadOBJ(url) {
  try {
    console.log(`Loading OBJ file from: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const objText = await response.text();
    console.log("OBJ file loaded successfully!");
    return parseOBJ(objText, url);
  } catch (error) {
    console.error("Error loading OBJ file:", error);
    return null;
  }
}

// Parse OBJ File
function parseOBJ(objText, url) {
  console.log("Parsing OBJ file...");
  const lines = objText.split("\n");
  const positions = [];
  const normals = [];
  const indices = [];
  const uniqueVertices = {};
  let index = 0;

  // Log first 10 lines
  console.log("First 10 lines of OBJ file:");
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    console.log(lines[i]);
  }

  const tempPositions = [];
  const tempNormals = [];

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine === "" || trimmedLine.startsWith("#")) continue;

    const parts = trimmedLine.replace(/^\uFEFF/, "").split(/\s+/);
    const keyword = parts[0];

    if (keyword === "v") {
      const vertex = parts.slice(1).map(Number);
      if (vertex.length >= 3) {
        tempPositions.push(vertex.slice(0, 3));
      } else {
        console.warn("Invalid vertex line:", line);
      }
    } else if (keyword === "vn") {
      const normal = parts.slice(1).map(Number);
      if (normal.length >= 3) {
        tempNormals.push(normal.slice(0, 3));
      } else {
        console.warn("Invalid normal line:", line);
      }
    } else if (keyword === "f") {
      const faceVertices = parts.slice(1);

      // Triangulate
      for (let i = 1; i < faceVertices.length - 1; i++) {
        const v0 = faceVertices[0];
        const v1 = faceVertices[i];
        const v2 = faceVertices[i + 1];

        [v0, v1, v2].forEach((vertex) => {
          const [vIndex, vtIndex, vnIndex] = vertex.split("/").map(Number);

          // Assuming "v//vn" format
          const key = `${vIndex}//${vnIndex}`;

          if (!(key in uniqueVertices)) {
            uniqueVertices[key] = index++;

            // Push position
            const position = tempPositions[vIndex - 1];
            positions.push(...position);

            // Push normal
            const normal = tempNormals[vnIndex - 1] || [0, 0, 1];
            normals.push(...normal);
          }

          indices.push(uniqueVertices[key]);
        });
      }
    }
  }

  console.log(`Parsed ${positions.length / 3} vertices.`);
  console.log(`Parsed ${normals.length / 3} normals.`);
  console.log(`Parsed ${indices.length / 3} triangles.`);

  if (positions.length === 0 || indices.length === 0 || normals.length === 0) {
    console.error("Parsed OBJ data is incomplete. Check the OBJ file content.");
    return null;
  }

  // Assign colors
  const colors = [];
  for (let i = 0; i < positions.length / 3; i++) {
    const randomColor = getRandomPredefinedColor();
    colors.push(...randomColor);
  }

  return {
    a_position: { numComponents: 3, data: positions },
    a_normal: { numComponents: 3, data: normals },
    a_color: { numComponents: 4, data: colors },
    indices: { numComponents: 3, data: indices },
  };
}

// Main Function
async function main() {
  const canvas = document.querySelector("canvas");
  if (!canvas) {
    console.error("Canvas element not found in the HTML.");
    return;
  }

  gl = canvas.getContext("webgl2");
  if (!gl) {
    console.error("WebGL2 not supported in this browser.");
    return;
  }
  console.log("WebGL2 context initialized.");

  programInfo = twgl.createProgramInfo(gl, [vsGLSL, fsGLSL]);
  console.log("Shader program compiled and linked.");

  // Load OBJ files
  const [carObjURL, lowBuildingObjURL, squareObjURL] = [
    "./car.obj",
    "./low_building.obj",
    "./cube.obj",
  ];
  console.log(
    "Attempting to load OBJ files:",
    carObjURL,
    lowBuildingObjURL,
    squareObjURL
  );

  const [loadedCarArrays, loadedObstacleArrays, loadedSquareArrays] =
    await Promise.all([
      loadOBJ(carObjURL),
      loadOBJ(lowBuildingObjURL),
      loadOBJ(squareObjURL),
    ]);

  // Create VAOs and BufferInfos
  if (loadedCarArrays) {
    console.log("Car arrays:", loadedCarArrays);
    carBufferInfo = twgl.createBufferInfoFromArrays(gl, loadedCarArrays);
    console.log("Car buffer info created.");
    carVao = twgl.createVAOFromBufferInfo(gl, programInfo, carBufferInfo);
    console.log("Car VAO created.");
  } else {
    console.error("Failed to load or parse the car OBJ file.");
    return;
  }

  if (loadedObstacleArrays) {
    console.log("Obstacle arrays:", loadedObstacleArrays);
    obstacleBufferInfo = twgl.createBufferInfoFromArrays(
      gl,
      loadedObstacleArrays
    );
    console.log("Obstacles buffer info created.");
    obstacleVao = twgl.createVAOFromBufferInfo(
      gl,
      programInfo,
      obstacleBufferInfo
    );
    console.log("Obstacles VAO created.");
  } else {
    console.error("Failed to load or parse the low_building OBJ file.");
    return;
  }

  if (loadedSquareArrays) {
    console.log("Square arrays:", loadedSquareArrays);
    squareBufferInfo = twgl.createBufferInfoFromArrays(gl, loadedSquareArrays);
    console.log("Square buffer info created.");
    squareVao = twgl.createVAOFromBufferInfo(gl, programInfo, squareBufferInfo);
    console.log("Square VAO created.");
  } else {
    console.error("Failed to load or parse the square OBJ file.");
    return;
  }

  setupUI();
  await initAgentsModel();
  await getAgents();
  await getObstacles();
  await getOtherAgents(); // Fetch other agents if implemented
  await drawScene(
    gl,
    programInfo,
    carVao,
    carBufferInfo,
    obstacleVao,
    obstacleBufferInfo,
    squareVao,
    squareBufferInfo
  );
}

/*
 * Initializes the agents model by sending a POST request to the agent server.
 */
async function initAgentsModel() {
  try {
    console.log("Initializing agents model on the server...");
    const response = await fetch(agent_server_uri + "init", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });

    if (response.ok) {
      const result = await response.json();
      console.log("Server response:", result.message);
      console.log(
        `Car Agents: ${result.car_agents}, Obstacle Agents: ${result.obstacle_agents}`
      );
    } else {
      const errorResult = await response.json();
      console.error(
        `Server responded with status: ${response.status}`,
        errorResult
      );
    }
  } catch (error) {
    console.error("Error initializing agents model:", error);
  }
}

/*
 * Retrieves the current positions of all Car agents from the server.
 */
async function getAgents() {
  try {
    console.log("Fetching agents from the server...");
    const response = await fetch(agent_server_uri + "getAgents");

    if (response.ok) {
      const result = await response.json();
      console.log("Agents fetched:", result.positions);

      if (!carAgents.length) {
        result.positions.forEach((agent) => {
          carAgents.push(
            new Object3DCar(agent.id, [agent.x, agent.y, agent.z])
          );
        });
        console.log("Car Agents array initialized:", carAgents);
      } else {
        result.positions.forEach((agent) => {
          const existingAgent = carAgents.find((a) => a.id === agent.id);
          if (existingAgent) {
            existingAgent.position = [agent.x, agent.y, agent.z];
          } else {
            // If a new agent appears, add it
            carAgents.push(
              new Object3DCar(agent.id, [agent.x, agent.y, agent.z])
            );
          }
        });
        console.log("Car Agents array updated:", carAgents);
      }
    } else {
      const errorResult = await response.json();
      console.error(
        `Failed to fetch agents. Status: ${response.status}`,
        errorResult
      );
    }
  } catch (error) {
    console.error("Error fetching agents:", error);
  }
}

/*
 * Retrieves the current positions of all Obstacles from the server.
 */
async function getObstacles() {
  try {
    console.log("Fetching obstacles from the server...");
    const response = await fetch(agent_server_uri + "getObstacles");

    if (response.ok) {
      const result = await response.json();
      console.log("Obstacles fetched:", result.positions);

      // Clear existing obstacles if any
      obstacleAgents.length = 0;

      result.positions.forEach((obstacle) => {
        obstacleAgents.push(
          new Object3D(obstacle.id, [obstacle.x, obstacle.y, obstacle.z])
        );
      });
      console.log("Obstacles array initialized:", obstacleAgents);
    } else {
      const errorResult = await response.json();
      console.error(
        `Failed to fetch obstacles. Status: ${response.status}`,
        errorResult
      );
    }
  } catch (error) {
    console.error("Error fetching obstacles:", error);
  }
}

/*
 * Retrieves the current positions of other agents from the server.
 */
async function getOtherAgents() {
  try {
    console.log("Fetching other agents from the server...");
    const response = await fetch(agent_server_uri + "getOtherAgents");

    if (response.ok) {
      const result = await response.json();
      console.log("Other Agents fetched:", result.positions);

      // Clear existing square agents if any
      squareAgents.length = 0;

      result.positions.forEach((agent) => {
        squareAgents.push(new Object3D(agent.id, [agent.x, agent.y, agent.z]));
      });
      console.log("Square Agents array initialized:", squareAgents);
    } else {
      const errorResult = await response.json();
      console.error(
        `Failed to fetch other agents. Status: ${response.status}`,
        errorResult
      );
    }
  } catch (error) {
    console.error("Error fetching other agents:", error);
  }
}

/*
 * Draws the scene by rendering the agents and obstacles.
 */
async function drawScene(
  gl,
  programInfo,
  carVao,
  carBufferInfo,
  obstacleVao,
  obstacleBufferInfo,
  squareVao,
  squareBufferInfo
) {
  // Resize the canvas to match the display size
  twgl.resizeCanvasToDisplaySize(gl.canvas);

  // Set the viewport to match the canvas size
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  // Set the clear color and enable depth testing
  gl.clearColor(0.2, 0.2, 0.2, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE); // Disable back-face culling for debugging

  // Clear the color and depth buffers
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  // Use the shader program
  gl.useProgram(programInfo.program);

  // Set up the view-projection matrix
  const viewProjectionMatrix = setupWorldView(gl);
  console.log("View-Projection Matrix:", viewProjectionMatrix);

  // Draw Car Agents
  if (carVao && carBufferInfo) {
    drawModel(viewProjectionMatrix, carVao, carBufferInfo, carAgents, "Car");
  } else {
    console.warn("Car VAO or BufferInfo is not available.");
  }

  // Draw Obstacle Agents
  if (obstacleVao && obstacleBufferInfo) {
    drawModel(
      viewProjectionMatrix,
      obstacleVao,
      obstacleBufferInfo,
      obstacleAgents,
      "Obstacle"
    );
  } else {
    console.warn("Obstacles VAO or BufferInfo is not available.");
  }

  // Draw Square Placeholder Agents
  if (squareVao && squareBufferInfo) {
    drawModel(
      viewProjectionMatrix,
      squareVao,
      squareBufferInfo,
      squareAgents,
      "Square"
    );
  } else {
    console.warn("Square VAO or BufferInfo is not available.");
  }

  // Increment the frame count
  frameCount++;

  // Update the scene every 30 frames
  if (frameCount % 30 === 0) {
    frameCount = 0;
    await update();
  }

  // Request the next frame
  requestAnimationFrame(() =>
    drawScene(
      gl,
      programInfo,
      carVao,
      carBufferInfo,
      obstacleVao,
      obstacleBufferInfo,
      squareVao,
      squareBufferInfo
    )
  );
}

/*
 * Draws a specific model based on agent type.
 */
function drawModel(
  viewProjectionMatrix,
  vao,
  bufferInfo,
  agentsArray,
  modelType
) {
  console.log(`Drawing ${modelType} agents...`);
  gl.bindVertexArray(vao);

  agentsArray.forEach((agent, idx) => {
    // Log agent details
    console.log(
      `Drawing ${modelType} Agent ID: ${agent.id}, Position: ${agent.position}, Rotation: ${agent.rotation}, Scale: ${agent.scale}`
    );

    // Create transformation matrices
    const translationMatrix = twgl.m4.translation(agent.position);
    const rotationX = twgl.m4.rotationX((agent.rotation[0] * Math.PI) / 180);
    const rotationY = twgl.m4.rotationY((agent.rotation[1] * Math.PI) / 180);
    const rotationZ = twgl.m4.rotationZ((agent.rotation[2] * Math.PI) / 180);
    const scaleMatrix = twgl.m4.scale(twgl.m4.identity(), [
      agent.scale[0],
      agent.scale[1],
      agent.scale[2],
    ]);

    // Combine transformations: Translation * RotationX * RotationY * RotationZ * Scale
    let modelMatrix = twgl.m4.multiply(translationMatrix, rotationX);
    modelMatrix = twgl.m4.multiply(modelMatrix, rotationY);
    modelMatrix = twgl.m4.multiply(modelMatrix, rotationZ);
    modelMatrix = twgl.m4.multiply(modelMatrix, scaleMatrix);

    // Combine with view-projection matrix
    const matrix = twgl.m4.multiply(viewProjectionMatrix, modelMatrix);

    // Set uniforms
    const uniforms = { u_matrix: matrix };
    twgl.setUniforms(programInfo, uniforms);

    // Draw the model
    twgl.drawBufferInfo(gl, bufferInfo);
    console.log(`${modelType} Agent ${idx} drawn with matrix:`, matrix);
  });
}

/*
 * Sets up the view-projection matrix.
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

  console.log("View-Projection Matrix set up:", viewProjectionMatrix);
  return viewProjectionMatrix;
}

/*
 * Sets up the user interface using lil-gui.
 */
function setupUI() {
  const gui = new GUI();
  const posFolder = gui.addFolder("Camera Position:");
  posFolder.add(cameraPosition, "x", -50, 50).onChange(() => {
    console.log("Camera position updated:", cameraPosition);
  });
  posFolder.add(cameraPosition, "y", -50, 50).onChange(() => {
    console.log("Camera position updated:", cameraPosition);
  });
  posFolder.add(cameraPosition, "z", -50, 50).onChange(() => {
    console.log("Camera position updated:", cameraPosition);
  });
  posFolder.open();
}

/*
 * Updates the agent positions by sending a request to the agent server.
 */
async function update() {
  try {
    console.log("Sending update request to the server...");
    const response = await fetch(agent_server_uri + "update");

    if (response.ok) {
      const result = await response.json();
      console.log("Server response:", result.message);
      await getAgents(); // Update agents after server update
      await getObstacles(); // Optionally update obstacles if they can change
      await getOtherAgents(); // Update other agents if implemented
    } else {
      const errorResult = await response.json();
      console.error(`Update failed. Status: ${response.status}`, errorResult);
    }
  } catch (error) {
    console.error("Error updating agents:", error);
  }
}

/*
 * Starts the application.
 */
main();
