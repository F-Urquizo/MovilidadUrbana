# traffic_server.py

import sys
import os
from flask import Flask, request, jsonify
from flask_cors import CORS

# Determine the absolute path to the trafficBase directory
current_dir = os.path.dirname(os.path.abspath(__file__))
traffic_base_path = os.path.join(current_dir, 'trafficBase')

# Add trafficBase to sys.path to allow module imports
sys.path.append(traffic_base_path)

# Change the working directory to trafficBase
os.chdir(traffic_base_path)

# Now, import the necessary modules
from trafficBase.model import CityModel
from trafficBase.agent import Road, Traffic_Light, Obstacle, Destination, Car

# Initialize global variables
number_agents = 10
width = 28
height = 28
randomModel = None
currentStep = 0

# Initialize Flask app
app = Flask("Traffic Example")
CORS(app)  # Enable CORS for all routes and origins

# Route to initialize the model
# traffic_server.py (Relevant Section)

@app.route('/init', methods=['POST'])
def initModel():
    global randomModel
    if request.method == 'POST':
        try:
            data = request.get_json()
            number_agents = int(data.get('NAgents', 10))
            randomModel = CityModel(number_agents)

            print(f"Model initialized with {len(randomModel.cars)} cars and {len(randomModel.destinations)} destinations.")
            
            return jsonify({
                "message": "Parameters received, model initiated.",
                "number_agents": number_agents
            }), 200
        except Exception as e:
            print(f"Error initializing model: {e}")
            return jsonify({"message": "Error initializing the model.", "error": str(e)}), 500


# Route to get positions of Car agents
@app.route('/getAgents', methods=['GET'])
def getAgents():
    global randomModel
    if randomModel is None:
        return jsonify({"message": "Model not initialized."}), 400
    try:
        agentPositions = [
            {"id": str(a.unique_id), "x": x, "y": 1, "z": z}
            for a, (x, z) in randomModel.grid.coord_iter()
            if isinstance(a, Car)
        ]
        print(f"Fetched {len(agentPositions)} Car agents: {agentPositions}")
        return jsonify({'positions': agentPositions}), 200
    except Exception as e:
        print(f"Error retrieving agents: {e}")
        return jsonify({'message': 'Error retrieving agents.', 'error': str(e)}), 500

@app.route('/getObstacles', methods=['GET'])
def getObstacles():
    global randomModel
    if randomModel is None:
        return jsonify({"message": "Model not initialized."}), 400
    try:
        obstaclePositions = [
            {"id": str(a.unique_id), "x": x, "y": 1, "z": z}
            for a, (x, z) in randomModel.grid.coord_iter()
            if isinstance(a, Obstacle)
        ]
        print(f"Fetched {len(obstaclePositions)} Obstacles: {obstaclePositions}")
        return jsonify({'positions': obstaclePositions}), 200
    except Exception as e:
        print(f"Error retrieving obstacles: {e}")
        return jsonify({'message': 'Error retrieving obstacles.', 'error': str(e)}), 500

# Route to update the model
@app.route('/update', methods=['GET'])
def updateModel():
    global currentStep, randomModel

    if request.method == 'GET':
        if randomModel is None:
            return jsonify({"message": "Model not initialized."}), 400
        try:
            # Advance the model by one step
            randomModel.step()
            currentStep += 1

            print(f"Model updated to step {currentStep}")

            return jsonify({
                'message': f'Model updated to step {currentStep}.',
                'currentStep': currentStep
            }), 200

        except Exception as e:
            print(f"Error updating model: {e}")
            return jsonify({'message': 'Error updating model.', 'error': str(e)}), 500

# Optional: Route to get Traffic Light states
@app.route('/getTrafficLights', methods=['GET'])
def getTrafficLights():
    global randomModel

    if request.method == 'GET':
        if randomModel is None:
            return jsonify({"message": "Model not initialized."}), 400
        try:
            trafficLights = [
                {
                    "id": str(a.unique_id),
                    "x": x,
                    "y": 1,  # Fixed y-coordinate for Unity's 3D space
                    "z": z,
                    "state": "Green" if a.state else "Red"
                }
                for a, (x, z) in randomModel.grid.coord_iter()
                if isinstance(a, Traffic_Light)
            ]

            return jsonify({'traffic_lights': trafficLights}), 200

        except Exception as e:
            print(f"Error retrieving traffic lights: {e}")
            return jsonify({'message': 'Error retrieving traffic lights.', 'error': str(e)}), 500
        
@app.route('/getOtherAgents', methods=['GET'])
def getOtherAgents():
    global randomModel

    if request.method == 'GET':
        if randomModel is None:
            return jsonify({"message": "Model not initialized."}), 400
        try:
            # Retrieve positions of all Other agents (e.g., Roads, Traffic Lights, Destinations)
            otherPositions = [
                {
                    "id": str(a.unique_id),
                    "x": x,
                    "y": 1,  # Fixed y-coordinate for 3D space
                    "z": y
                }
                for a, (x, y) in randomModel.grid.coord_iter()
                if isinstance(a, Road) or isinstance(a, Traffic_Light) or isinstance(a, Destination)
            ]

            print(f"Retrieved {len(otherPositions)} Other agents.")

            return jsonify({'positions': otherPositions}), 200

        except Exception as e:
            print(f"Error retrieving other agents: {e}")
            return jsonify({'message': 'Error retrieving other agents.', 'error': str(e)}), 500

if __name__ == '__main__':
    # Run the Flask server on port 8585 without using the reloader
    app.run(host="0.0.0.0", port=8585, debug=True, use_reloader=False)
