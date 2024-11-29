# Movilidad Urbana

## Team members:

- Francisco Urquizo Schnaas
- Gabriel Edid Harari

## Project Description:

The developed simulation proposes a model based on a multi-agent system to represent and analyze urban traffic. This approach enables a graphical visualization of vehicle flow, identifying issues such as traffic jams and critical points in the road network. Through intelligent agents (cars) that dynamically react to traffic conditions, strategies can be evaluated to reduce congestion and optimize mobility.

The simulation integrates pathfinding techniques (A\*) and adaptive behaviors such as lane-changing, allowing cars to navigate around blockages and efficiently reach their destinations. Additionally, it includes traffic lights as traffic regulators, enhancing the realism and usefulness of the tool for analyzing complex urban scenarios.

## Dependencies

### Mesa flask server

You should have the following dependencies in your Python installation or in a virtual environment (usually with venv).

- Python
- Mesa version 2.4.0: pip install mesa==2.4.0
- Flask: pip install flask
- Flask Cors: pip install flask_cors

### Visualization server

The following is installed when you use `npm i` inside the **`tarfficServer/visualization`** folder.

- Lil-gui: lil-gui ^0.19.2
- Twgl: twgl.js ^5.5.4
- Vite: vite ^5.3.4

## Instructions to run the local server and application.

- Make sure you have the dependencies installed.
- Go to the **`trafficServer`** folder.
- Run the flask server:

`python agents_server.py`

> [!TIP]
> Use `python` or `python3` depending on your case. Remember to activate your virtual environment if you require it.

- The script is listening to port 8585 (http://localhost:8585). **Double check that your server is launching on that port.**

## Running the WebGL application

- Move to the **`trafficServer/visualization`** folder.
- Make sure that you installed the dependencies with `npm i`.
- Run the vite server:

`npx vite`

- If everything is running, you should acces the webpage: http://localhost:5173
- It should render the whole city simulation.

> [!NOTE]
> To see a video of the simulation go to the link in the file **simulation_video**.

## Run **Only** Mesa Server

- Make sure you have the Python dependencies (previously mentioned) installed.
- Go to the **`trafficServer/trafficBase`** folder.
- Run the server:

`python agent.py`

> [!IMPORTANT]
> You might need to change something to the `model.py` file. The following line at the top:  
> `from .agent import Road, Traffic_Light, Obstacle, Destination, Car`  
> Change it to:  
> `from agent import Road, Traffic_Light, Obstacle, Destination, Car`  
> Please note that with this modification you **will not** be able to run the visualization server.
