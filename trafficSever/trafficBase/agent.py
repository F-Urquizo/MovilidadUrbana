from mesa import Agent
import heapq

class Car(Agent):
    """
    Agent that moves towards a destination using A* pathfinding with lane-switching capabilities.
    """

    def __init__(self, unique_id, model, destination_pos):
        super().__init__(unique_id, model)
        self.destination_pos = destination_pos
        self.path = None
        self.last_position = None
        self.stuck_counter = 0  # To track how long the car has been in the same position

    def heuristic(self, a, b):
        """Calculate the Manhattan distance heuristic."""
        return abs(a[0] - b[0]) + abs(a[1] - b[1])

    def is_lane_clear(self, position):
        """Check if a specific lane (position) is clear."""
        agents_at_position = self.model.grid.get_cell_list_contents([position])
        return all(not isinstance(agent, Car) for agent in agents_at_position)

    def detect_car_in_front(self):
        """Detect if there's a car directly in front of the current position."""
        next_move = self.path[0] if self.path else None
        if next_move:
            agents_at_next = self.model.grid.get_cell_list_contents([next_move])
            return any(isinstance(agent, Car) for agent in agents_at_next)
        return False

    def switch_lanes(self):
        """Attempt to switch lanes to avoid being stuck behind another car."""
        # Check parallel lanes (left and right)
        current_x, current_y = self.pos
        possible_lanes = [
            (current_x, current_y + 1),  # Right lane
            (current_x, current_y - 1)  # Left lane
        ]

        for lane in possible_lanes:
            if self.model.grid.out_of_bounds(lane):
                continue  # Skip if the lane is out of bounds

            if self.is_lane_clear(lane):
                print(f"{self.unique_id}: Switching lanes to {lane}")
                self.model.grid.move_agent(self, lane)
                return True

        print(f"{self.unique_id}: Unable to switch lanes.")
        return False

    def find_path(self):
        """Find a valid path using A*."""
        start = self.pos
        goal = self.destination_pos
        grid = self.model.grid

        open_set = []
        heapq.heappush(open_set, (0 + self.heuristic(start, goal), 0, start, [start]))
        closed_set = set()

        def is_move_allowed(current, neighbor):
            agents_at_neighbor = grid.get_cell_list_contents([neighbor])

            if any(isinstance(agent, Car) for agent in agents_at_neighbor):
                return False  # Avoid collisions

            intended_direction = (neighbor[0] - current[0], neighbor[1] - current[1])
            opposite_direction = ""
            if intended_direction == (1, 0):  
                opposite_direction = "Left"
            elif intended_direction == (-1, 0):  
                opposite_direction = "Right"
            elif intended_direction == (0, 1):  
                opposite_direction = "Down"
            elif intended_direction == (0, -1):  
                opposite_direction = "Up"

            for agent in agents_at_neighbor:
                if isinstance(agent, Road) and agent.direction == opposite_direction:
                    return False 

            return True

        while open_set:
            f_score, g_score, current, path = heapq.heappop(open_set)

            if current == goal:
                return path[1:]

            if current in closed_set:
                continue
            closed_set.add(current)

            neighbors = grid.get_neighborhood(
                current,
                moore=False,
                include_center=False
            )

            for neighbor in neighbors:
                if neighbor in closed_set:
                    continue

                if not is_move_allowed(current, neighbor):
                    continue

                # Check if the neighbor is traversable (Road, Destination, or Traffic Light)
                agents_at_neighbor = grid.get_cell_list_contents([neighbor])
                traversable = any(isinstance(agent, (Road, Destination, Traffic_Light)) for agent in agents_at_neighbor)

                if not traversable:
                    continue

                tentative_g_score = g_score + 1  # Assuming uniform cost

                # Check if neighbor is already in open_set with a higher g_score
                in_open_set = False
                for item in open_set:
                    if item[2] == neighbor and tentative_g_score >= item[1]:
                        in_open_set = True
                        break

                if not in_open_set:
                    heapq.heappush(open_set, (tentative_g_score + self.heuristic(neighbor, goal), tentative_g_score, neighbor, path + [neighbor]))

        print(f"No path found for {self.unique_id} from {start} to {goal}.")
        return []

    def step(self):
        # Update stuck counter
        if self.last_position == self.pos:
            self.stuck_counter += 1
        else:
            self.stuck_counter = 0
        self.last_position = self.pos

        # Check if stuck for too long
        if self.stuck_counter > 15:
            print(f"{self.unique_id}: Stuck for {self.stuck_counter} steps. Finding alternate path.")
            self.path = self.find_path()
            self.stuck_counter = 0  # Reset the counter
            return

        # Pathfinding logic
        if self.path is None:
            self.path = self.find_path()
            if not self.path:
                print(f"{self.unique_id}: No initial path found.")
                return

        # Check if there's a car in front and attempt lane switching
        if self.detect_car_in_front():
            if not self.switch_lanes():
                print(f"{self.unique_id}: Waiting for the car in front to move.")
                return

        # Move along the path
        if self.path:
            next_move = self.path[0]  # Peek without popping
            agents_at_next = self.model.grid.get_cell_list_contents([next_move])

            can_move = True
            for agent in agents_at_next:
                if isinstance(agent, Traffic_Light) and not agent.state:
                    can_move = False  # Red light blocks movement
                elif isinstance(agent, Obstacle):
                    can_move = False  # Obstacle blocks movement
                elif isinstance(agent, Car):
                    can_move = False  # Another car blocks movement

            if can_move:
                self.model.grid.move_agent(self, next_move)
                print(f"{self.unique_id} moved to {next_move}")
                self.path.pop(0)  # Remove the step after moving
            else:
                print(f"{self.unique_id} blocked at {next_move}, waiting for green light or car to move or obstacle to clear.")
        else:
            if self.pos == self.destination_pos:
                print(f"{self.unique_id} has arrived at the destination.")
                self.model.grid.remove_agent(self)
                self.model.schedule.remove(self)
            else:
                self.path = self.find_path()



class Traffic_Light(Agent):
    def __init__(self, unique_id, model, state=False, timeToChange=10):
        super().__init__(unique_id, model)
        self.state = state
        self.timeToChange = timeToChange

    def step(self):
        if self.model.schedule.steps % self.timeToChange == 0:
            self.state = not self.state
            state_str = "Green" if self.state else "Red"
            print(f"Traffic Light {self.unique_id} changed to {state_str}")

class Destination(Agent):
    def __init__(self, unique_id, model):
        super().__init__(unique_id, model)

    def step(self):
        pass

class Obstacle(Agent):
    def __init__(self, unique_id, model):
        super().__init__(unique_id, model)

    def step(self):
        pass

class Road(Agent):
    def __init__(self, unique_id, model, direction="Left"):
        super().__init__(unique_id, model)
        self.direction = direction

    def step(self):
        pass
