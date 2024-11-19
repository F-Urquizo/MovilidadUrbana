# server.py

from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS, cross_origin
from randomAgents.model import RandomModel
from randomAgents.agent import RandomAgent, ObstacleAgent
import os

# Size of the board:
number_agents = 10
width = 28
height = 28
randomModel = None
currentStep = 0

# Initialize Flask app with static folder
app = Flask(__name__, static_folder='static', static_url_path='/static')
CORS(app)  # Enable CORS for all routes and origins

# Route to serve the index.html
@app.route('/')
def serve_index():
    return send_from_directory(app.static_folder, 'index.html')

# Serve other static files (JS, CSS, OBJ)
@app.route('/<path:filename>')
def serve_static_files(filename):
    return send_from_directory(app.static_folder, filename)

# API Routes

# Initialize the model
@app.route('/init', methods=['POST'])
@cross_origin()
def initModel():
    global currentStep, randomModel, number_agents, width, height

    if request.method == 'POST':
        try:
            number_agents = int(request.json.get('NAgents'))
            width = int(request.json.get('width'))
            height = int(request.json.get('height'))
            currentStep = 0

            print(request.json)
            print(f"Model parameters: {number_agents, width, height}")

            # Create the model using the parameters sent by the application
            randomModel = RandomModel(number_agents, width, height)

            # Return a message saying the model was created successfully
            return jsonify({"message": "Parameters received, model initiated."})

        except Exception as e:
            print(e)
            return jsonify({"message": "Error initializing the model"}), 500

# Get agents' positions
@app.route('/getAgents', methods=['GET'])
@cross_origin()
def getAgents():
    global randomModel

    if request.method == 'GET':
        try:
            agentPositions = [
                {"id": str(a.unique_id), "x": x, "y": 1, "z": z}
                for a, (x, z) in randomModel.grid.coord_iter()
                if isinstance(a, RandomAgent)
            ]

            return jsonify({'positions': agentPositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error with the agent positions"}), 500

# Get obstacles' positions
@app.route('/getObstacles', methods=['GET'])
@cross_origin()
def getObstacles():
    global randomModel

    if request.method == 'GET':
        try:
            carPositions = [
                {"id": str(a.unique_id), "x": x, "y": 1, "z": z}
                for a, (x, z) in randomModel.grid.coord_iter()
                if isinstance(a, ObstacleAgent)
            ]

            return jsonify({'positions': carPositions})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error with obstacle positions"}), 500

# Update the model
@app.route('/update', methods=['GET'])
@cross_origin()
def updateModel():
    global currentStep, randomModel
    if request.method == 'GET':
        try:
            randomModel.step()
            currentStep += 1
            return jsonify({'message': f'Model updated to step {currentStep}.', 'currentStep': currentStep})
        except Exception as e:
            print(e)
            return jsonify({"message": "Error during step."}), 500

if __name__ == '__main__':
    # Run the Flask server on port 8585
    app.run(host="localhost", port=8585, debug=True)
