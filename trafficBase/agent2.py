from mesa import Agent

class Car(Agent):
    """
    Agent that moves randomly.
    Attributes:
        unique_id: Agent's ID 
        direction: Randomly chosen direction chosen from one of eight directions
    """
    def __init__(self, unique_id, model):
        """
        Creates a new random agent.
        Args:
            unique_id: The agent's ID
            model: Model reference for the agent
        """
        super().__init__(unique_id, model)
        self.curr_direction = None

    # def move(self):
    #     """ 
    #     Determines if the agent can move based on the direction of the current cell,
    #     prioritizes moving in the direction it is supposed to, and handles traffic lights.
    #     """
    #     x, y = self.pos
    #     width = self.model.grid.width
    #     height = self.model.grid.height
    #     next_move = None

    #     # Helper function to get the next position based on a direction
    #     def get_next_position(x, y, direction):
    #         if direction == "Right":
    #             return (x + 1, y) if x + 1 < width else None
    #         if direction == "Left":
    #             return (x - 1, y) if x - 1 >= 0 else None
    #         if direction == "Up":
    #             return (x, y + 1) if y + 1 < height else None
    #         if direction == "Down":
    #             return (x, y - 1) if y - 1 >= 0 else None
    #         return None

    #     # Helper function to get the opposite direction
    #     def get_opposite_direction(direction):
    #         if direction == "Right":
    #             return "Left"
    #         if direction == "Left":
    #             return "Right"
    #         if direction == "Up":
    #             return "Down"
    #         if direction == "Down":
    #             return "Up"
    #         return None

    #     # Helper function to check if the car can pass a traffic light
    #     def can_pass_traffic_light(agent):
    #         return not (isinstance(agent, Traffic_Light) and not agent.state)

    #     # Get the current cell's direction
    #     current_agents = self.model.grid.get_cell_list_contents([(x, y)])
    #     current_direction = None
    #     for agent in current_agents:
    #         if isinstance(agent, Road):
    #             current_direction = agent.direction
    #             print(f"Current road direction: {current_direction}")
    #             break

    #     # If the current cell is a road with a direction, prioritize moving in that direction
    #     if current_direction:
    #         target_pos = get_next_position(x, y, current_direction)
    #         if target_pos:
    #             agents_at_target = self.model.grid.get_cell_list_contents([target_pos])
    #             if len(agents_at_target) > 0:
    #                 agent_at_target = agents_at_target[0]
    #                 # Check if the agent at the target position is a Road and if the direction is valid
    #                 if isinstance(agent_at_target, Road) and agent_at_target.direction != get_opposite_direction(current_direction):
    #                     print(f"Moving in the current direction to {target_pos}")
    #                     next_move = target_pos
    #                 # Check if the agent at the target position is a Traffic Light and if the light is green
    #                 elif isinstance(agent_at_target, Traffic_Light) and can_pass_traffic_light(agent_at_target):
    #                     print(f"Traffic light is green at {target_pos}, moving forward")
    #                     next_move = target_pos
    #                 else:
    #                     print(f"Cannot move in the current direction to {target_pos}: Blocked or traffic light issue")

    #     # If no valid move in the current direction, check left and right
    #     if not next_move:
    #         print("Checking left and right options")

    #         # Check the right position first
    #         right_pos = get_next_position(x, y, "Right")
    #         if right_pos:
    #             agents_at_right = self.model.grid.get_cell_list_contents([right_pos])
    #             if len(agents_at_right) > 0 and isinstance(agents_at_right[0], Road) and agents_at_right[0].direction != "Left":
    #                 print(f"Moving to the right to {right_pos}")
    #                 next_move = right_pos
    #             else:
    #                 print(f"Cannot move to the right to {right_pos}: Blocked or wrong road direction")

    #         # Check the left position if no move was decided
    #         if not next_move:
    #             left_pos = get_next_position(x, y, "Left")
    #             if left_pos:
    #                 agents_at_left = self.model.grid.get_cell_list_contents([left_pos])
    #                 if len(agents_at_left) > 0 and isinstance(agents_at_left[0], Road) and agents_at_left[0].direction != "Right":
    #                     print(f"Moving to the left to {left_pos}")
    #                     next_move = left_pos
    #                 else:
    #                     print(f"Cannot move to the left to {left_pos}: Blocked or wrong road direction")

    #     # Move the car if a valid move was found
    #     if next_move:
    #         print(f"Moving car to {next_move}")
    #         self.model.grid.move_agent(self, next_move)
    #     else:
    #         print("No available moves")

    def move(self):
        x, y = self.pos
        # Get the current cell's direction
        current_agents = self.model.grid.get_cell_list_contents([(x, y)])
        current_direction = None

        for agent in current_agents:
            if isinstance(agent, Road):
                current_direction = agent.direction
                self.curr_direction = agent.direction
                print(f"Current road direction: {current_direction}")
                break

        # If no current direction is found, use the last known direction
        if current_direction is None:
            current_direction = self.curr_direction

        # Ensure we have a valid direction before proceeding
        if current_direction is None:
            print("No valid direction found. Agent cannot move.")
            return

        # Get the next position based on the direction
        next_pos = self.getNextPos(x, y, current_direction)

        # Check if the next position is within the grid bounds
        if self.model.grid.out_of_bounds(next_pos):
            print("Next position is out of bounds. Agent cannot move.")
            return

        # Move the agent to the next position
        next_agents = self.model.grid.get_cell_list_contents([next_pos])
        for agent in next_agents:
            if isinstance(agent, Road) or (isinstance(agent, Traffic_Light) and agent.state):
                self.model.grid.move_agent(self, next_pos)
            else:
                pass

        # next_agents = self.model.grid.get_cell_list_contents([next_pos])
        # for agent in next_agents:
        #     if isinstance(agent, Road):
        #         self.model.grid.move_agent(self, next_pos)
        #     elif isinstance(agent, Traffic_Light):
        #         if agent.state:
        #             self.model.grid.move_agent(self, next_pos)
        #         else:
        #             pass

    
    def getNextPos(self, x, y, current_direction):
        if current_direction == "Right":
            return (x + 1, y)
        elif current_direction == "Left":
            return (x - 1, y)
        elif current_direction == "Up":
            return (x, y + 1)
        elif current_direction == "Down":
            return (x, y - 1)
        

    def step(self):
        """ 
        Determines the new direction it will take, and then moves
        """
        self.move()
