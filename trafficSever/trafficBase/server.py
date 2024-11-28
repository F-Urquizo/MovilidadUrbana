from agent import *
from model import CityModel
from mesa.visualization import CanvasGrid, TextElement
from mesa.visualization import ModularServer
from mesa.visualization import Slider

def agent_portrayal(agent):
    if agent is None: return
    
    portrayal = {"Shape": "rect",
                 "Filled": "true",
                 "Layer": 1,
                 "w": 0.5 if isinstance(agent, Car) else 1,
                 "h": 0.5 if isinstance(agent, Car) else 1
                 }

    if (isinstance(agent, Car)):
        portrayal["Color"] = "purple"
        portrayal["Layer"] = 1

    if (isinstance(agent, Road)):
        portrayal["Color"] = "grey"
        portrayal["Layer"] = 0
    
    if (isinstance(agent, Destination)):
        portrayal["Color"] = "lightgreen"
        portrayal["Layer"] = 0

    if (isinstance(agent, Traffic_Light)):
        portrayal["Color"] = "red" if not agent.state else "green"
        portrayal["Layer"] = 0
        portrayal["w"] = 0.8
        portrayal["h"] = 0.8

    if (isinstance(agent, Obstacle)):
        portrayal["Color"] = "cadetblue"
        portrayal["Layer"] = 0
        portrayal["w"] = 0.8
        portrayal["h"] = 0.8

    return portrayal

width = 0
height = 0

with open('../city_files/concurso.txt') as baseFile:
    lines = baseFile.readlines()
    width = len(lines[0])-1
    height = len(lines)

class ReachedDestinationsElement(TextElement):
    def render(self, model):
        reached_destinations = model.compute_reached_destinations()
        return f"Reached Destinations: {reached_destinations:}"
    
class CarsInSimElement(TextElement):
    def render(self, model):
        cars_in_sim = model.compute_cars_in_sim()
        return f"Cars In Sim: {cars_in_sim:}"

cars_in_sim = CarsInSimElement()
reached_destinations = ReachedDestinationsElement()
# model_params = {"N": Slider("Number of cars", 4, 1, 1000, 1)}

print(width, height)
grid = CanvasGrid(agent_portrayal, width, height, 500, 500)

server = ModularServer(CityModel, [grid, cars_in_sim, reached_destinations], "Traffic Base")
                       
server.port = 8521 # The default
server.launch()
