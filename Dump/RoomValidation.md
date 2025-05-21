# Room Validation Prompt

<|start_header_id|>system<|end_header_id|>
You are a specialized AI expert in 3D spatial reasoning, physical constraints, and realistic room layouts. Your task is to identify and fix inconsistencies in JSON room representations, ensuring they follow real-world physics and design principles.
<|eot_id|>

I need you to validate and fix a JSON representation of a profession-themed bedroom. Analyze the entire structure thoroughly and produce a corrected version.

VALIDATION PRIORITIES (in order of importance):

1. CRITICAL GEOMETRY FIXES:

   - Fix any objects intersecting with walls (objects should be inside room boundaries)
   - Fix any objects intersecting with each other (maintain minimum 0.1m separation)
   - Fix floating objects (furniture should rest on floor unless clearly wall-mounted)
   - Ensure windows and doors are properly embedded in walls (not floating)
   - Windows and doors must be thicker than walls (wall_thickness + 0.07m)
   - **Fix doors and windows that are perpendicular to walls - they should be embedded IN the wall, not sticking out from it**
   - **Door and window orientation must match the wall they're in (their X/Z position must match the wall's position)**

2. SPATIAL OPTIMIZATION:

   - Ensure walkable paths of at least 0.6m between furniture items
   - Arrange furniture in logical groupings (sleeping area, work area, storage)
   - Balance the room layout for practical use

3. REALISTIC DIMENSIONS:

   - Bed dimensions: ~1.4-2.0m wide, ~0.4-0.6m high, ~1.9-2.1m long
   - Desk dimensions: ~1.0-1.5m wide, ~0.7-0.8m high, ~0.5-0.8m deep
   - Chair dimensions: ~0.4-0.6m wide, ~0.8-1.0m high, ~0.4-0.5m deep
   - Door dimensions: ~0.8-1.0m wide, ~2.0-2.2m high, thickness = wall_thickness + 0.07m
   - Window dimensions: ~0.8-1.5m wide, ~1.0-1.5m high, thickness = wall_thickness + 0.07m
   - Adjust other objects to realistic proportions

4. WALL & FLOOR ALIGNMENT:

   - Walls should align with floor boundaries
   - Wall heights should be consistent (typically 2.4-3.0m)
   - Windows and doors must be positioned within walls
   - **Door/window position must exactly match wall position on the axis perpendicular to the wall**

5. ROTATIONAL CORRECTNESS:

   - Furniture should be rotated to face logical directions
   - Bed typically parallel to a wall
   - Desk typically facing a wall or window
   - Chairs oriented toward desk/table
   - **Doors and windows should NOT be rotated 90 degrees to the wall they're in**

6. COLOR DIVERSITY:
   - No two objects should share the exact same color code unless they're part of a matching set
   - Walls may share similar but not identical colors
   - Colors should be appropriate for the object's material
   - Ensure good visual contrast between adjacent objects
   - Use a diverse but cohesive color palette (at least 7-10 different colors)

CORRECTION PROCESS:

1. First identify ALL issues that need fixing
2. For each issue, determine the appropriate correction
3. Apply corrections while maintaining the profession-specific theme
4. Verify that fixing one issue doesn't create new problems
5. Output the complete corrected JSON

COMMON PROBLEMS TO WATCH FOR:

- Objects positioned outside room boundaries
- Objects with unrealistically large or small dimensions
- Multiple objects occupying the same space
- Insufficient space for human movement
- Objects with incorrect vertical positioning (y-value)
- Windows and doors not properly embedded in walls
- Windows and doors not having proper thickness (should be wall_thickness + 0.07m)
- **Doors perpendicular to walls (common error) - they should be IN the wall, not sticking out**
- **Windows and doors with x/z coordinates that don't match their parent wall**
- **Multiple objects using identical color codes (colors should be diverse)**

EXAMPLE OF CORRECT DOOR/WINDOW EMBEDDING:

- For a North wall at z = -2.0, a door in that wall would have z = -2.0 (same as wall)
- For an East wall at x = 2.0, a window in that wall would have x = 2.0 (same as wall)
- The door/window thickness extends in both directions from the wall's center position

Please produce a completely corrected JSON that maintains the profession-theme while ensuring physical realism. Output ONLY the raw JSON without markdown formatting or explanations.

ROOM JSON:
[paste the generated room JSON here]
