"use strict";

import * as twgl from "twgl.js";
import GUI from "lil-gui";

// Define the vertex shader code, using GLSL 3.00
const vsGLSL = `#version 300 es
precision highp float;

in vec4 a_position;
in vec4 a_color;
in vec3 a_normal; // Include normal if using lighting

uniform mat4 u_matrix;

out vec4 v_color;
// out vec3 v_normal; // Uncomment if using lighting

void main() {
    gl_Position = u_matrix * a_position;
    v_color = a_color;
    // v_normal = a_normal; // Uncomment if using lighting
}
`;

// Define the fragment shader code, using GLSL 3.00
const fsGLSL = `#version 300 es
precision highp float;

in vec4 v_color;
// in vec3 v_normal; // Uncomment if using lighting
out vec4 outColor;

void main() {
    outColor = v_color;
    // Implement lighting calculations here if using normals
}
`;

// Define the Object3D class to represent 3D objects
class Object3D {
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
    this.matrix = twgl.m4.identity(); // Initialize with identity matrix
  }
}

const agent_server_uri = "http://localhost:8585/";

let gl, programInfo, obstacleArrays, obstaclesBufferInfo, obstaclesVao;
let agentsVao, agentsBufferInfo, agentArrays;
const agents = [];
const obstacles = [];
const cameraPosition = { x: 0, y: 9, z: 9 };
const data = { NAgents: 10, width: 10, height: 10 };
let frameCount = 0;

// Load and parse OBJ file
async function loadOBJ(url) {
  try {
    console.log(`Loading OBJ file from: ${url}`);
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const objText = await response.text();
    console.log("OBJ file loaded successfully!");
    return parseOBJ(objText);
  } catch (error) {
    console.error("Error loading OBJ file:", error);
    return null;
  }
}

// Parse OBJ file text with unique vertex-normal handling
function parseOBJ(objText) {
  console.log("Parsing OBJ file...");
  const lines = objText.split("\n");
  const positions = [];
  const normals = [];
  const indices = [];
  const uniqueVertices = {};
  let index = 0;

  // Log the first 10 lines to verify content
  console.log("First 10 lines of OBJ file:");
  for (let i = 0; i < Math.min(10, lines.length); i++) {
    console.log(lines[i]);
  }

  // Temporary arrays to store vertex positions and normals
  const tempPositions = [];
  const tempNormals = [];

  for (const line of lines) {
    const trimmedLine = line.trim();

    // Skip empty lines and comments
    if (trimmedLine === "" || trimmedLine.startsWith("#")) continue;

    // Split the line by whitespace
    const parts = trimmedLine.replace(/^\uFEFF/, "").split(/\s+/);
    const keyword = parts[0];

    if (keyword === "v") {
      // Vertex position
      const vertex = parts.slice(1).map(Number);
      if (vertex.length >= 3) {
        tempPositions.push(vertex.slice(0, 3));
      } else {
        console.warn("Invalid vertex line:", line);
      }
    } else if (keyword === "vn") {
      // Vertex normal
      const normal = parts.slice(1).map(Number);
      if (normal.length >= 3) {
        tempNormals.push(normal.slice(0, 3));
      } else {
        console.warn("Invalid normal line:", line);
      }
    } else if (keyword === "f") {
      // Face definition
      const faceVertices = parts.slice(1);

      // Triangulate the face if it's a quad or polygon
      for (let i = 1; i < faceVertices.length - 1; i++) {
        const v0 = faceVertices[0];
        const v1 = faceVertices[i];
        const v2 = faceVertices[i + 1];

        [v0, v1, v2].forEach((vertex) => {
          const [vIndex, vtIndex, vnIndex] = vertex.split("/").map(Number);

          // Handle cases like "f v", "f v/vt", "f v//vn", "f v/vt/vn"
          // Here, we assume the format is "v//vn" as per your initial parser
          const key = `${vIndex}//${vnIndex}`;

          if (!(key in uniqueVertices)) {
            uniqueVertices[key] = index++;

            // Push position
            const position = tempPositions[vIndex - 1];
            positions.push(...position);

            // Push normal
            const normal = tempNormals[vnIndex - 1] || [0, 0, 1]; // Default normal
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

  // Verify that the data arrays are not empty
  if (positions.length === 0 || indices.length === 0 || normals.length === 0) {
    console.error("Parsed OBJ data is incomplete. Check the OBJ file content.");
    return null;
  }

  return {
    a_position: { numComponents: 3, data: positions },
    a_normal: { numComponents: 3, data: normals },
    a_color: {
      numComponents: 4,
      data: new Array(positions.length / 3)
        .fill([1, 0, 0, 1]) // Red color for agents
        .flat(),
    },
    indices: { numComponents: 3, data: indices },
  };
}

// Main function
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

  // Generate and set up obstacle data
  obstacleArrays = generateObstacleData(1);
  console.log("Obstacle arrays generated:", obstacleArrays);
  obstaclesBufferInfo = twgl.createBufferInfoFromArrays(gl, obstacleArrays);
  console.log("Obstacle buffer info created.");
  obstaclesVao = twgl.createVAOFromBufferInfo(
    gl,
    programInfo,
    obstaclesBufferInfo
  );
  console.log("Obstacle VAO created.");

  // Load OBJ file for agents
  const objURL = "./ferrari.obj"; // Ensure this path is correct relative to your server
  console.log("Attempting to load OBJ file:", objURL);
  agentArrays = await loadOBJ(objURL);

  if (agentArrays) {
    console.log("Agent arrays:", agentArrays);
    console.log(`Positions Length: ${agentArrays.a_position.data.length}`);
    console.log(`Normals Length: ${agentArrays.a_normal.data.length}`);
    console.log(`Indices Length: ${agentArrays.indices.data.length}`);

    if (
      agentArrays.a_position.data.length === 0 ||
      agentArrays.indices.data.length === 0 ||
      agentArrays.a_normal.data.length === 0
    ) {
      console.error(
        "Parsed OBJ data is incomplete. Check the OBJ file content."
      );
      return;
    }

    agentsBufferInfo = twgl.createBufferInfoFromArrays(gl, agentArrays);
    console.log("Agents buffer info created.");
    agentsVao = twgl.createVAOFromBufferInfo(gl, programInfo, agentsBufferInfo);
    console.log("Agents VAO created.");
  } else {
    console.error("Failed to load or parse the OBJ file.");
  }

  setupUI();
  await initAgentsModel();
  await getAgents();
  await getObstacles();
  await drawScene(
    gl,
    programInfo,
    agentsVao,
    agentsBufferInfo,
    obstaclesVao,
    obstaclesBufferInfo
  );
}

// Initialize agents model by sending a POST request
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
    } else {
      console.error(`Server responded with status: ${response.status}`);
    }
  } catch (error) {
    console.error("Error initializing agents model:", error);
  }
}

// Retrieve current positions of all agents from the server
async function getAgents() {
  try {
    console.log("Fetching agents from the server...");
    const response = await fetch(agent_server_uri + "getAgents");

    if (response.ok) {
      const result = await response.json();
      console.log("Agents fetched:", result.positions);

      if (!agents.length) {
        result.positions.forEach((agent) => {
          agents.push(new Object3D(agent.id, [agent.x, agent.y, agent.z]));
        });
        console.log("Agents array initialized:", agents);
      } else {
        result.positions.forEach((agent) => {
          const existingAgent = agents.find((a) => a.id === agent.id);
          if (existingAgent) {
            existingAgent.position = [agent.x, agent.y, agent.z];
          }
        });
        console.log("Agents array updated:", agents);
      }
    } else {
      console.error(`Failed to fetch agents. Status: ${response.status}`);
    }
  } catch (error) {
    console.error("Error fetching agents:", error);
  }
}

// Retrieve current positions of all obstacles from the server
async function getObstacles() {
  try {
    console.log("Fetching obstacles from the server...");
    const response = await fetch(agent_server_uri + "getObstacles");

    if (response.ok) {
      const result = await response.json();
      console.log("Obstacles fetched:", result.positions);

      result.positions.forEach((obstacle) => {
        obstacles.push(
          new Object3D(obstacle.id, [obstacle.x, obstacle.y, obstacle.z])
        );
      });
      console.log("Obstacles array initialized:", obstacles);
    } else {
      console.error(`Failed to fetch obstacles. Status: ${response.status}`);
    }
  } catch (error) {
    console.error("Error fetching obstacles:", error);
  }
}

// Draw the scene
async function drawScene(
  gl,
  programInfo,
  agentsVao,
  agentsBufferInfo,
  obstaclesVao,
  obstaclesBufferInfo
) {
  twgl.resizeCanvasToDisplaySize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
  gl.clearColor(0.2, 0.2, 0.2, 1);
  gl.enable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE); // Disable back-face culling for debugging
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  gl.useProgram(programInfo.program);

  const viewProjectionMatrix = setupWorldView(gl);
  console.log("View-Projection Matrix:", viewProjectionMatrix);

  if (agentsVao && agentsBufferInfo) {
    drawAgents(viewProjectionMatrix, agentsVao, agentsBufferInfo);
  } else {
    console.warn("Agents VAO or BufferInfo is not available.");
  }

  if (obstaclesVao && obstaclesBufferInfo) {
    drawObstacles(viewProjectionMatrix, obstaclesVao, obstaclesBufferInfo);
  } else {
    console.warn("Obstacles VAO or BufferInfo is not available.");
  }

  frameCount++;
  if (frameCount % 30 === 0) {
    frameCount = 0;
    await update();
  }
  requestAnimationFrame(() =>
    drawScene(
      gl,
      programInfo,
      agentsVao,
      agentsBufferInfo,
      obstaclesVao,
      obstaclesBufferInfo
    )
  );
}

// Draw agents
function drawAgents(viewProjectionMatrix, agentsVao, agentsBufferInfo) {
  console.log("Drawing agents...");
  gl.bindVertexArray(agentsVao);
  agents.forEach((agent, idx) => {
    // Log agent details
    console.log(
      `Drawing Agent ID: ${agent.id}, Position: ${agent.position}, Rotation: ${agent.rotation}, Scale: ${agent.scale}`
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

    // Draw the agent
    twgl.drawBufferInfo(gl, agentsBufferInfo);
    console.log(`Agent ${idx} drawn with matrix:`, matrix);
  });
}

// Draw obstacles
function drawObstacles(
  viewProjectionMatrix,
  obstaclesVao,
  obstaclesBufferInfo
) {
  console.log("Drawing obstacles...");
  gl.bindVertexArray(obstaclesVao);
  obstacles.forEach((obstacle, idx) => {
    // Log obstacle details
    console.log(
      `Drawing Obstacle ID: ${obstacle.id}, Position: ${obstacle.position}, Rotation: ${obstacle.rotation}, Scale: ${obstacle.scale}`
    );

    // Create transformation matrices
    const translationMatrix = twgl.m4.translation(obstacle.position);
    const rotationX = twgl.m4.rotationX((obstacle.rotation[0] * Math.PI) / 180);
    const rotationY = twgl.m4.rotationY((obstacle.rotation[1] * Math.PI) / 180);
    const rotationZ = twgl.m4.rotationZ((obstacle.rotation[2] * Math.PI) / 180);
    const scaleMatrix = twgl.m4.scale(twgl.m4.identity(), [
      obstacle.scale[0],
      obstacle.scale[1],
      obstacle.scale[2],
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

    // Draw the obstacle
    twgl.drawBufferInfo(gl, obstaclesBufferInfo);
    console.log(`Obstacle ${idx} drawn with matrix:`, matrix);
  });
}

// Set up the view-projection matrix
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

// Set up the user interface using lil-gui
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

// Generate obstacle data (cube)
function generateObstacleData(size) {
  let arrays = {
    a_position: {
      numComponents: 3,
      data: [
        // Front Face
        -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,

        // Back Face
        -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5, -0.5,

        // Top Face
        -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, 0.5, -0.5,

        // Bottom Face
        -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,

        // Right Face
        0.5, -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5,

        // Left Face
        -0.5, -0.5, -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, 0.5, -0.5, 0.5, -0.5,
      ].map((e) => size * e),
    },
    a_color: {
      numComponents: 4,
      data: [
        // Front face
        0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1,
        // Back Face
        0.333, 0.333, 0.333, 1, 0.333, 0.333, 0.333, 1, 0.333, 0.333, 0.333, 1,
        0.333, 0.333, 0.333, 1,
        // Top Face
        0.5, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 1, 0.5, 0.5, 0.5, 1,
        // Bottom Face
        0.666, 0.666, 0.666, 1, 0.666, 0.666, 0.666, 1, 0.666, 0.666, 0.666, 1,
        0.666, 0.666, 0.666, 1,
        // Right Face
        0.833, 0.833, 0.833, 1, 0.833, 0.833, 0.833, 1, 0.833, 0.833, 0.833, 1,
        0.833, 0.833, 0.833, 1,
        // Left Face
        1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
      ],
    },
    indices: {
      numComponents: 3,
      data: [
        0,
        1,
        2,
        0,
        2,
        3, // Front face
        4,
        5,
        6,
        4,
        6,
        7, // Back face
        8,
        9,
        10,
        8,
        10,
        11, // Top face
        12,
        13,
        14,
        12,
        14,
        15, // Bottom face
        16,
        17,
        18,
        16,
        18,
        19, // Right face
        20,
        21,
        22,
        20,
        22,
        23, // Left face
      ],
    },
  };
  console.log("Obstacle data generated:", arrays);
  return arrays;
}

// Update agents by sending a request to the server
async function update() {
  try {
    console.log("Sending update request to the server...");
    const response = await fetch(agent_server_uri + "update");

    if (response.ok) {
      const result = await response.json();
      console.log("Server response:", result.message);
      await getAgents(); // Update agents after server update
      await getObstacles(); // Optionally update obstacles if they can change
    } else {
      console.error(`Update failed. Status: ${response.status}`);
    }
  } catch (error) {
    console.error("Error updating agents:", error);
  }
}

// Start the application
main();
