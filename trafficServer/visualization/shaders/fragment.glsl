#version 300 es
precision highp float;

/* 
 * Reto - Movilidad Urbana
 * Modelación de Sistemas Multiagentes con Gráficas Computacionales
 * 28/11/2024
 * Francisco José Urquizo Schnaas A01028786
 * Gabriel Edid Harari A01782146
 * fragment.glsl 
 */

in vec3 v_normal;
in vec3 v_lightDirection;
in vec3 v_cameraDirection;
in vec4 v_emissiveColor;
in vec3 v_worldPosition;

// Scene uniforms
uniform vec4 u_ambientLight;
uniform vec4 u_diffuseLight;
uniform vec4 u_specularLight;

// Model uniforms
uniform vec4 u_ambientColor;
uniform vec4 u_diffuseColor;
uniform vec4 u_specularColor;
uniform float u_shininess;

// Traffic Light uniforms
const int MAX_TRAFFIC_LIGHTS = 100;
uniform int u_numTrafficLights;
uniform vec3 u_trafficLightPositions[MAX_TRAFFIC_LIGHTS];
uniform vec4 u_trafficLightColors[MAX_TRAFFIC_LIGHTS];

out vec4 outColor;

void main() {
    // Normalizar los vectores recibidos
    vec3 v_n_n = normalize(v_normal);
    vec3 v_l_n = normalize(v_lightDirection);
    vec3 v_c_n = normalize(v_cameraDirection);

    // Componente de iluminación ambiental
    vec4 ambient = u_ambientLight * u_ambientColor;

    // Componente de iluminación difusa
    vec4 diffuse = vec4(0.0);
    float lambert = max(dot(v_n_n, v_l_n), 0.0);
    if (lambert > 0.0) {
        diffuse += u_diffuseLight * u_diffuseColor * lambert;
    }

    // Componente de iluminación especular
    vec4 specular = vec4(0.0);
    if (lambert > 0.0) {
        vec3 reflectDir = reflect(-v_l_n, v_n_n);
        float specAngle = max(dot(reflectDir, v_c_n), 0.0);
        float specFactor = pow(specAngle, u_shininess);
        specular += u_specularLight * u_specularColor * specFactor;
    }

    // Iluminación de los semáforos
    for(int i = 0; i < MAX_TRAFFIC_LIGHTS; i++) {
        if(i >= u_numTrafficLights) break;

        vec3 lightPos = u_trafficLightPositions[i];
        vec4 lightColor = u_trafficLightColors[i];

        // Vector desde el fragmento hacia la luz del semáforo
        vec3 toLight = lightPos - v_worldPosition;
        float distance = length(toLight);
        vec3 toLightDir = normalize(toLight);

        // Atenuación: puedes ajustar los factores según tus necesidades
        float attenuation = 1.0 / (distance * distance);

        // Lambertiano
        float lambertTL = max(dot(v_n_n, toLightDir), 0.0);
        diffuse += lightColor * lambertTL * attenuation;

        // Especular
        if(lambertTL > 0.0) {
            vec3 reflectDirTL = reflect(-toLightDir, v_n_n);
            float specAngleTL = max(dot(reflectDirTL, v_c_n), 0.0);
            float specFactorTL = pow(specAngleTL, u_shininess);
            specular += lightColor * specFactorTL * attenuation;
        }
    }

    // Componente de emisión
    vec4 emissive = v_emissiveColor;

    outColor = ambient + diffuse + specular + emissive;
}