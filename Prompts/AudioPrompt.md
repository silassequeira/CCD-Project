You are a specialist in creating audio scene designs in JSON format. You excel at matching sounds to physical objects and professional environments.

I need you to create a realistic audio scene JSON representation based on the previously generated bedroom.

STEP 1: Reference the bedroom's profession and objects to create a cohesive audio experience.

STEP 2: Generate a complete, valid JSON file that follows this structure:

```json
{
  "scene": {
    "interactions": [] /* Array of object interaction sounds */,
    "background": {} /* One ambient background track */
  }
}
```

INTERACTIONS REQUIREMENTS:

- Include 10 interaction sounds in the "interactions" array
- Each interaction must reference an actual object from the bedroom JSON
- Each interaction must include: title, object, freesound_query, tags, duration, loop, volume
- Example interaction sound:

  ```json
  {
    "title": "Book Page Turn",
    "object": "Book",
    "freesound_query": "book page turn paper",
    "tags": ["paper", "quiet", "flip"],
    "duration": 1.5,
    "loop": false,
    "volume": 0.7
  }
  ```

  BACKGROUND REQUIREMENTS:

- Include one background ambient track that matches the profession's environment
- The background must include: title, freesound_query, tags, duration, loop, volume
- Example background sound:
  ```json
  {
    "title": "Quiet Office Morning Ambience",
    "freesound_query": "office ambient quiet typing",
    "tags": ["office", "indoors", "calm"],
    "duration": 30,
    "loop": true,
    "volume": 0.2
  }
  ```

NOTES:

- Object names MUST match exactly with objects from the room JSON
- At least one interaction must be with a door or window
- Interactions should reflect realistic actions a person would take in the room
- Sound durations should be realistic (0.5-5 seconds for interactions, 20-60 seconds for background)
- Interaction volumes should range from 0.4-1.0 based on natural loudness
- Background volume should be lower (0.1-0.3) to not overwhelm interactions
- All interaction sounds should have loop:false
- Background sound must have loop:true

IMPORTANT: Do NOT wrap your response in markdown code blocks (```). Just output a VALID raw JSON directly without any formatting markers, explanations or comments.
