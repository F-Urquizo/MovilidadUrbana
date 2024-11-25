from mesa import Model
from mesa.time import RandomActivation
from mesa.space import MultiGrid
from agent import *
import json
import random

class CityModel(Model):
    """ 
        Creates a model based on a city map.

        Args:
            N: Number of agents (cars) in the simulation
    """
    def __init__(self, N):

        super().__init__()  # Initialize the base Model class to avoid FutureWarning

        # Load the map dictionary. The dictionary maps the characters in the map file to the corresponding agent.
        with open("city_files/mapDictionary.json") as f:
            dataDictionary = json.load(f)

        self.traffic_lights = []
        self.cars = []
        self.destinations = []
        self.step_count = 0
        self.num_cars = N
        self.unique_id = 0

        # Load the map file. The map file is a text file where each character represents an agent.
        with open('city_files/2022_base.txt') as baseFile:
            lines = baseFile.readlines()
            self.width = len(lines[0].strip())  # Ensure no trailing newline affects width
            self.height = len(lines)
            self.grid = MultiGrid(self.width, self.height, torus=False) 
            self.schedule = RandomActivation(self)

            # Collect all road positions for validation
            road_positions = []

            # Goes through each character in the map file and creates the corresponding agent.
            for r, row in enumerate(lines):
                for c, col in enumerate(row.strip()):
                    pos = (c, self.height - r - 1)  # Mesa's y-axis starts at bottom
                    if col in ["v", "^", ">", "<"]:
                        agent = Road(f"r_{r*self.width+c}", self, dataDictionary[col])
                        self.grid.place_agent(agent, pos)
                        road_positions.append(pos)

                    elif col in ["S", "s"]:
                        agent = Traffic_Light(
                            f"tl_{r*self.width+c}", 
                            self, 
                            state=False if col == "S" else True, 
                            timeToChange=int(dataDictionary[col])
                        )
                        self.grid.place_agent(agent, pos)
                        self.schedule.add(agent)
                        self.traffic_lights.append(agent)

                    elif col == "#":
                        agent = Obstacle(f"ob_{r*self.width+c}", self)
                        self.grid.place_agent(agent, pos)

                    elif col == "D":
                        agent = Destination(f"d_{r*self.width+c}", self)
                        self.grid.place_agent(agent, pos)
                        self.destinations.append(agent)

        # Ensure there are enough destinations
        # if N > len(self.destinations):
        #     raise ValueError("Number of cars exceeds number of destinations.")

        # Shuffle destinations to assign randomly (optional if hardcoding)
        random.shuffle(self.destinations)

        # Define the four starting positions
        self.starting_positions = [
            (0, 0),
            (0, self.height - 1),      # e.g., (0,24) if height=25
            (self.width - 1, 0),       # e.g., (23,0) if width=24
            (self.width - 1, self.height - 1)  # e.g., (23,24) if width=24 and height=25
        ]

        # Validate that starting positions are on roads
        for pos in self.starting_positions:
            agents_at_pos = self.grid.get_cell_list_contents([pos])
            if not any(isinstance(agent, Road) for agent in agents_at_pos):
                raise ValueError(f"Starting position {pos} does not contain a Road agent.")

        # **Hardcode the destination position**
        hardcoded_destination = (3, 22)  # Replace with your desired coordinates

        # **Ensure a Destination agent exists at the hardcoded destination**
        # Check if a Destination agent already exists at hardcoded_destination
        existing_dest = False
        for dest in self.destinations:
            if self.grid.get_cell_list_contents([hardcoded_destination]):
                existing_dest = True
                break

        if not existing_dest:
            # Create and place a Destination agent at the hardcoded position
            dest_agent = Destination(f"d_hardcoded", self)
            self.grid.place_agent(dest_agent, hardcoded_destination)
            self.schedule.add(dest_agent)
            self.destinations.append(dest_agent)

        # Create Car agents and assign random destinations from self.destinations
        initial_cars = 4 if self.num_cars >= 4 else self.num_cars
        self.spawn_cars(initial_cars)


        self.num_cars = self.num_cars - initial_cars
        print("Remaining cars to spawn: ", self.num_cars)
        self.running = True

    def spawn_cars(self, N):
        # Create Car agents and assign random destinations from self.destinations
        for i in range(N):
            start_pos = self.starting_positions[i % len(self.starting_positions)]  # Ensure we don't exceed starting positions
            random_destination = random.choice(self.destinations)  # Select a random destination
            carAgent = Car(
                unique_id=f"car_{self.unique_id+1}", 
                model=self, 
                destination_pos=(random_destination.pos[0], random_destination.pos[1])  # Assign random destination coordinates
            )
            self.unique_id += 1
            self.grid.place_agent(carAgent, start_pos)
            self.schedule.add(carAgent)
            self.cars.append(carAgent)

    def step(self):
        '''Advance the model by one step.'''
        self.schedule.step()
        self.step_count += 1

        # Spawn 4 cars every 10 steps
        if self.step_count % 10 == 0 and self.num_cars > 0:
            if self.num_cars >= 4:
                self.spawn_cars(4)
                self.num_cars -= 4
                print("Remaining cars to spawn: ", self.num_cars)
            else:
                self.spawn_cars(self.num_cars)
                self.num_cars -= self.num_cars
                print("Remaining cars to spawn: ", self.num_cars)
