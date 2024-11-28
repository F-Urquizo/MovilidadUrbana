"""
Reto - Movilidad Urbana
Modelación de Sistemas Multiagentes con Gráficas Computacionales
28/11/2024
Francisco José Urquizo Schnaas A01028786
Gabriel Edid Harari A01782146
server.py
"""

# Importaciones necesarias desde los módulos locales y la biblioteca Mesa
from agent import *  # Importa todas las clases de agentes definidas en el módulo agent
from model import CityModel  # Importa la clase principal del modelo de la ciudad
from mesa.visualization import CanvasGrid, TextElement  # Importa herramientas de visualización de Mesa
from mesa.visualization import ModularServer  # Importa el servidor modular para la visualización
from mesa.visualization import Slider  # Importa el componente Slider para controles interactivos

def agent_portrayal(agent):
    """
    Define cómo se representa cada agente en la visualización de la cuadrícula.

    Esta función determina las propiedades visuales de cada agente, como su forma, color, 
    tamaño y capa en la que se dibuja, dependiendo del tipo de agente (Car, Road, Destination, 
    Traffic_Light, Obstacle).

    Parámetros:
        agent: Instancia del agente a representar.

    Retorna:
        Un diccionario con las propiedades de representación del agente o None si el agente es vacío.
    """
    if agent is None:
        return  # No hay agente para representar en esta celda
    
    # Definición base de la representación del agente
    portrayal = {
        "Shape": "rect",  # Forma rectangular
        "Filled": "true",  # Forma rellena
        "Layer": 1,        # Capa de dibujo por defecto
        "w": 0.5 if isinstance(agent, Car) else 1,  # Ancho ajustado para los coches
        "h": 0.5 if isinstance(agent, Car) else 1   # Alto ajustado para los coches
    }

    # Configuración específica para cada tipo de agente
    if isinstance(agent, Car):
        portrayal["Color"] = "purple"  # Color púrpura para los coches
        portrayal["Layer"] = 1  # Capa superior para que se dibujen sobre otros elementos

    elif isinstance(agent, Road):
        portrayal["Color"] = "grey"  # Color gris para las carreteras
        portrayal["Layer"] = 0  # Capa inferior

    elif isinstance(agent, Destination):
        portrayal["Color"] = "lightgreen"  # Color verde claro para destinos
        portrayal["Layer"] = 0  # Capa inferior

    elif isinstance(agent, Traffic_Light):
        portrayal["Color"] = "red" if not agent.state else "green"  # Rojo si está en estado 'no', verde si está en 'sí'
        portrayal["Layer"] = 0  # Capa inferior
        portrayal["w"] = 0.8  # Ancho ajustado
        portrayal["h"] = 0.8  # Alto ajustado

    elif isinstance(agent, Obstacle):
        portrayal["Color"] = "cadetblue"  # Color azul cadete para obstáculos
        portrayal["Layer"] = 0  # Capa inferior
        portrayal["w"] = 0.8  # Ancho ajustado
        portrayal["h"] = 0.8  # Alto ajustado

    return portrayal  # Retorna el diccionario de propiedades para la representación

# Inicialización de las dimensiones del mapa
width = 0
height = 0

# Cargar el mapa desde un archivo para determinar el ancho y alto del grid
with open('../city_files/concurso.txt') as baseFile:
    lines = baseFile.readlines()  # Lee todas las líneas del archivo
    width = len(lines[0].strip())  # Determina el ancho basado en la primera línea, eliminando posibles saltos de línea
    height = len(lines)  # Determina el alto basado en el número total de líneas

class ReachedDestinationsElement(TextElement):
    """
    Elemento de texto que muestra el número de destinos alcanzados en la simulación.

    Este elemento se actualiza dinámicamente para reflejar el progreso de los coches hacia sus destinos.
    """
    def render(self, model):
        reached_destinations = model.compute_reached_destinations()  # Calcula destinos alcanzados
        return f"Reached Destinations: {reached_destinations}"  # Retorna el texto a mostrar

class CarsInSimElement(TextElement):
    """
    Elemento de texto que muestra la cantidad de coches actualmente en la simulación.

    Este elemento proporciona una visión en tiempo real de la cantidad de agentes 'Car' activos.
    """
    def render(self, model):
        cars_in_sim = model.compute_cars_in_sim()  # Calcula la cantidad de coches en la simulación
        return f"Cars In Sim: {cars_in_sim}"  # Retorna el texto a mostrar

# Instanciación de los elementos de texto para la visualización
cars_in_sim = CarsInSimElement()
reached_destinations = ReachedDestinationsElement()

# Definición de los parámetros del modelo, incluyendo el ancho y alto del grid
model_params = {
    "width": width,   # Ancho del grid basado en el mapa cargado
    "height": height  # Alto del grid basado en el mapa cargado
}

print(width, height)  # Imprime las dimensiones del grid en la consola para verificación

# Configuración de la cuadrícula de la visualización usando CanvasGrid
grid = CanvasGrid(agent_portrayal, width, height, 500, 500)  # Tamaño de visualización de 500x500 píxeles

# Configuración del servidor modular para la visualización de Mesa
server = ModularServer(
    CityModel,  # Clase del modelo a ejecutar
    [grid, cars_in_sim, reached_destinations],  # Componentes de visualización a incluir
    "Traffic Base",  # Título de la visualización
    model_params  # Parámetros del modelo
)

server.port = 8521  # Asigna el puerto por defecto para acceder al servidor
server.launch()  # Inicia el servidor y lanza la interfaz de visualización
