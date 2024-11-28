#version 300 es
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

// Emissive uniform
uniform vec4 u_emissiveColor;

out vec3 v_normal;
out vec3 v_lightDirection;
out vec3 v_cameraDirection;
out vec4 v_emissiveColor;
out vec3 v_worldPosition;

void main() {
    gl_Position = u_worldViewProjection * a_position;

    v_normal = mat3(u_world) * a_normal;

    vec3 transformedPosition = (u_world * a_position).xyz;
    v_worldPosition = transformedPosition;

    v_lightDirection = u_lightWorldPosition - transformedPosition;
    v_cameraDirection = u_viewWorldPosition - transformedPosition;

    v_emissiveColor = u_emissiveColor;
}
