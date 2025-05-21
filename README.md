# Creative Domestic Soundscapes (Unity-Integrated Version)

For the Creativity Computational Design class, this project generates immersive domestic soundscapes using a combination of AI-driven generation, sound retrieval, and Unity-based spatialization.

## Project Overview

This project automates the creation of interactive soundscapes for virtual domestic environments. It leverages Large Language Models (LLMs) to generate creative room and sound descriptions, then uses the Freesound API to fetch real-world audio samples that match those descriptions. The resulting configuration and audio files are imported into Unity, where a custom script spatializes and assigns the sounds to objects in a 3D scene.

**Key Technologies:**

- **LLMs (Large Language Models):** Used to generate creative prompts and structure for rooms and their associated sounds.
- **Freesound API:** Retrieves real audio samples based on LLM-generated prompts.
- **Node.js/Express:** Orchestrates the pipeline, manages authentication, and serves the API.
- **Unity:** Loads the generated configuration and audio, spatializes sounds, and provides an interactive environment.

___

## Project Structure

- **PIPELINE/server.js**: Main pipeline logic, now triggered from within Unity.
- **Modules/**: Contains the core logic for room generation, audio generation, Freesound API integration, and Unity audio processing.
- **Unity/**: Unity project folder. Generated audio configuration (`audio.json`) is placed in `Unity/Assets/StreamingAssets/Responses/`.

___

## How the Pipeline Works

1. **Room Generation:**An LLM generates a creative description and structure for a virtual room (e.g., kitchen, living room), including objects and their properties.
2. **Audio Generation:**The LLM suggests suitable sounds for each object or area in the room. These prompts are used to search the Freesound database for matching audio samples.
3. **Unity Audio Processing:**
   The pipeline downloads the selected audio files and generates a configuration file (`audio.json`) that maps sounds to objects. Unity loads this configuration and spatializes the sounds in the 3D scene.

**In this version, the entire pipeline is triggered from inside Unity by pressing a button in the main scene.**
___

## Setup Instructions

1. **Install dependencies**In the `PIPELINE` folder, run:

   ```
   npm install
   ```
   ___

2. **Set up environment variables**Create a `.env` file in the `PIPELINE` folder with:

   ```
   FREESOUND_CLIENT_ID=your_client_id 
   FREESOUND_CLIENT_SECRET=your_client_secret 
   SESSION_SECRET=your_session_secret 
   PORT=3000
   ```
   ___

3. **Authenticate with Freesound**Open this URL in your browser (replace `YOUR_CLIENT_ID`):

   [https://freesound.org/apiv2/oauth2/authorize/?client_id=YOUR_CLIENT_ID&amp;response_type=code&amp;state=xyz](https://freesound.org/apiv2/oauth2/authorize/?client_id=YOUR_CLIENT_ID&response_type=code&state=xyz)

   Follow the login flow to authorize the app.

   ___

4. **Open Unity and Run the Pipeline**

   - Open the `Unity` folder as a Unity project in the Unity Hub or Unity Editor.
   - Open the main scene (e.g., `RoomGenerator.unity`) in the Unity Editor.
   - Press Play.
   - In the scene, you will see a button labeled **"Generate Soundscape"** (or similar).
   - Click the button. This will automatically run the entire pipeline (the logic from `server.js`), including room and audio generation, Freesound downloads, and Unity audio processing.
   - When the process finishes, the generated room and soundscape will be displayed and spatialized in Unity automatically.

___
