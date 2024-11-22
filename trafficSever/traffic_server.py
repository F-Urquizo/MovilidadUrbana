# traffic_server.py

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

# Importar el modelo y agentes desde el paquete trafficBase
from trafficBase.model import CityModel
from trafficBase.agent import Road, Traffic_Light, Obstacle, Destination, Car

# Inicializar variables globales
number_agents = 10
randomModel = None
currentStep = 0

# Inicializar la aplicación Flask
app = Flask(__name__, static_folder='static')
CORS(app)

# Servir archivos estáticos (si es necesario)
@app.route('/static/<path:filename>')
def serve_static(filename):
    return send_from_directory(app.static_folder, filename)

# Endpoint para inicializar el modelo
@app.route('/init', methods=['POST'])
def initModel():
    global randomModel, number_agents
    if request.method == 'POST':
        try:
            data = request.get_json()
            number_agents = int(data.get('NAgents', 10))
            randomModel = CityModel(number_agents)

            num_obstacles = len(randomModel.obstacles)
            print(f"Modelo inicializado con {len(randomModel.cars)} coches y {num_obstacles} obstáculos.")

            # Obtener posiciones iniciales de los agentes Car
            car_agents = [{
                "id": str(car.unique_id),
                "x": car.pos[0],
                "y": 1,
                "z": car.pos[1]
            } for car in randomModel.cars if car.pos is not None]

            # Obtener posiciones iniciales de los agentes Obstacle
            obstacle_agents = [{
                "id": str(obstacle.unique_id),
                "x": obstacle.pos[0],
                "y": 1,
                "z": obstacle.pos[1]
            } for obstacle in randomModel.obstacles if obstacle.pos is not None]

            print(f"Obstáculos enviados al frontend: {len(obstacle_agents)}")
            for obstacle in obstacle_agents:
                print(f"Obstáculo ID: {obstacle['id']}, Posición: ({obstacle['x']}, {obstacle['y']}, {obstacle['z']})")

            return jsonify({
                "message": "Parámetros recibidos, modelo iniciado.",
                "number_agents": number_agents,
                "car_agents": car_agents,
                "obstacle_agents": obstacle_agents,
                "width": randomModel.grid.width,
                "height": randomModel.grid.height
            }), 200
        except Exception as e:
            print(f"Error al inicializar el modelo: {e}")
            return jsonify({"message": "Error al inicializar el modelo.", "error": str(e)}), 500

# Endpoint para obtener posiciones de los agentes Car
@app.route('/getAgents', methods=['GET'])
def getAgents():
    global randomModel
    if randomModel is None:
        return jsonify({"message": "Modelo no inicializado."}), 400
    try:
        agentPositions = [{
            "id": str(car.unique_id),
            "x": car.pos[0],
            "y": 1,
            "z": car.pos[1]
        } for car in randomModel.cars if car.pos is not None]
        return jsonify({'positions': agentPositions}), 200
    except Exception as e:
        print(f"Error al recuperar agentes Car: {e}")
        return jsonify({'message': 'Error al recuperar agentes Car.', 'error': str(e)}), 500

# Endpoint para obtener posiciones de los agentes Obstacle
@app.route('/getObstacles', methods=['GET'])
def getObstacles():
    global randomModel
    if randomModel is None:
        return jsonify({"message": "Modelo no inicializado."}), 400
    try:
        obstaclePositions = [{
            "id": str(obstacle.unique_id),
            "x": obstacle.pos[0],
            "y": 1,
            "z": obstacle.pos[1]
        } for obstacle in randomModel.obstacles if obstacle.pos is not None]

        print(f"Obstáculos enviados al frontend en getObstacles: {len(obstaclePositions)}")
        for obstacle in obstaclePositions:
            print(f"Obstáculo ID: {obstacle['id']}, Posición: ({obstacle['x']}, {obstacle['y']}, {obstacle['z']})")

        return jsonify({'positions': obstaclePositions}), 200
    except Exception as e:
        print(f"Error al recuperar obstáculos: {e}")
        return jsonify({'message': 'Error al recuperar obstáculos.', 'error': str(e)}), 500

# Endpoint para actualizar el modelo
@app.route('/update', methods=['POST'])
def updateModel():
    global randomModel, currentStep
    if randomModel is None:
        return jsonify({"message": "Modelo no inicializado."}), 400
    try:
        data = request.get_json()
        steps = int(data.get('steps', 1))
        for _ in range(steps):
            randomModel.step()
            currentStep += 1
        return jsonify({"currentStep": currentStep}), 200
    except Exception as e:
        print(f"Error al actualizar el modelo: {e}")
        return jsonify({"message": "Error al actualizar el modelo.", "error": str(e)}), 500

# Endpoint para obtener otros agentes (si es necesario)
@app.route('/getOtherAgents', methods=['GET'])
def getOtherAgents():
    global randomModel
    if randomModel is None:
        return jsonify({"message": "Modelo no inicializado."}), 400
    try:
        other_agents = [{
            "id": str(agent.unique_id),
            "x": agent.pos[0],
            "y": 1,
            "z": agent.pos[1]
        } for agent in randomModel.schedule.agents if isinstance(agent, (Traffic_Light, Road, Destination))]
        return jsonify({'positions': other_agents}), 200
    except Exception as e:
        print(f"Error al recuperar otros agentes: {e}")
        return jsonify({'message': 'Error al recuperar otros agentes.', 'error': str(e)}), 500

if __name__ == '__main__':
    # Ejecutar el servidor Flask en el puerto 8585
    app.run(host="0.0.0.0", port=8585, debug=True, use_reloader=False)
