# Movilidad Urbana

## Team members:

- Francisco Urquizo Schnaas
- Gabriel Edid Harari

## Project Description:

The project seeks to solve the urban mobility problem in Mexico by reducing vehicle congestion through a graphical traffic simulation based on a multi-agent system. Strategies will be implemented such as the efficient allocation of parking spaces to prevent drivers from driving around looking for a place, the promotion of vehicle sharing to increase occupancy and reduce the number of cars on the streets, the recommendation of less congested routes to improve mobility and reduce pollution, and intelligent coordination of traffic lights to optimize flow at intersections. By visualizing these solutions, it is expected to analyze and demonstrate their positive impact on reducing traffic and improving urban mobility.

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
- Go to **`trafficServer`** folder.
- Run the flask server:

`python agents_server.py`

> [!NOTE]
> Use `python` or `python3` depending on your case, remember to activate your virtual environment if you require it.

- The script is listening to port 8585 (http://localhost:8585). **Double check that your server is launching on that port.**

## Running the WebGL application

- Move to the **`trafficServer/visualization`** folder.
- Make sure that you installed the dependencies with `npm i`.
- Run the vite server:

`npx vite`

- If everything is running, you should acces the webpage: http://localhost:5173
- It should render the whole city simulation.
