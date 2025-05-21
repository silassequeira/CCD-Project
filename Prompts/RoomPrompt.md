You are a specialist in creating detailed, physically accurate 3D room representations in JSON format. You excel at integrating profession-specific elements into bedroom designs.

I need you to create a realistic 3D bedroom JSON representation for a specific profession.

STEP 1: Choose ONE interesting profession (or a similar distinctive profession).

STEP 2: Generate a complete, valid JSON file that follows this structure:

```json
{
  "environment": {
    "name": "Bedroom of a [PROFESSION]",
    "width": [3.0-5.0],  /* Room width in meters */
    "depth": [3.0-5.0],  /* Room depth in meters */
    "wall_thickness": [0.1-0.3],  /* Wall thickness in meters */
    "shapes": []  /* Room structure elements */
  },
  "objects": []  /* Furniture and profession-specific items */
}
```

ENVIRONMENT REQUIREMENTS:

- Use realistic room dimensions (width/depth between 3-5 meters)
- Include these shapes in the "shapes" array:
  1. Floor (positioned at y=0)
  2. Wall_North, Wall_South, Wall_East, Wall_West (positioned correctly relative to floor)
  3. At least 1 Window (embedded in a wall, thickness should be wall_thickness + 0.07m)
  4. At least 1 Door (embedded in a wall, not the same as window, thickness should be wall_thickness + 0.07m)
- Each shape must include: name, shape, size, position, color values
- Example room structure shapes:

```json
{
  "name": "Floor",
  "shape": "Cube",
  "size": {"x": 4.0, "y": 0.1, "z": 4.0},
  "position": {"x": 0, "y": -0.05, "z": 0},
  "color": "#8B4513"
},
{
  "name": "Wall_North",
  "shape": "Cube",
  "size": {"x": 4.0, "y": 2.5, "z": 0.2},
  "position": {"x": 0, "y": 1.25, "z": -2.0},
  "color": "#F5F5DC"
},
{
  "name": "Door1",
  "shape": "Cube",
  "size": {"x": 0.9, "y": 2.1, "z": 0.27},  /* z-thickness is wall_thickness + 0.07m */
  "position": {"x": 1.0, "y": 1.05, "z": 2.0},  /* z-position matches the wall it's in */
  "color": "#8B4513"
},
{
  "name": "Window1",
  "shape": "Cube",
  "size": {"x": 1.2, "y": 1.4, "z": 0.27},  /* z-thickness is wall_thickness + 0.07m */
  "position": {"x": -1.0, "y": 1.5, "z": 2.0},  /* z-position matches the wall it's in */
  "color": "#87CEEB"
}
```

OBJECTS REQUIREMENTS:

- Include at least 10 objects in the "objects" array
- Each object must be relevant to either:
  a) The specific profession you chose
- Each object must include: name, shape, size, position, rotation, color values
- Example object:

```json
{
  "name": "Bed",
  "shape": "Cube",
  "size": { "x": 1.4, "y": 0.4, "z": 2.0 },
  "position": { "x": -1.2, "y": 0.2, "z": 0.5 },
  "rotation": { "x": 0, "y": 0, "z": 0 },
  "color": "#FFE4C4"
}
```

NOTES:

- Windows and doors must be EMBEDDED IN THE WALL, not perpendicular to it
  - Their position's X or Z coordinate (depending on which wall) must match exactly with the wall's position
  - Their thickness (in the direction perpendicular to the wall) should be wall_thickness + 0.07m
  - Door and window orientation should match the wall they're in (not rotated 90 degrees)
- Objects must not overlap or intersect with each other
- Furniture should be placed on the floor unless wall-mounted
- Maintain at least 0.6m walkways between furniture
- All sizes and positions must be physically realistic
- Avoid objects passing through walls
- Use the object shape that best represents the real item (Cube, Cylinder, Sphere, Capsule)
- Use appropriate CSS color codes for materials and don't repeat colors

IMPORTANT: Do NOT wrap your response in markdown code blocks (```). Just output a VALID raw JSON directly without any formatting markers, explanations or comments.
