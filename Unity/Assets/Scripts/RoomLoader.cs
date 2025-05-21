using System.IO;
using UnityEngine;
using System.Collections.Generic;
using System.Collections;

public class RoomLoader : MonoBehaviour
{
    public string jsonFileName = "room.json";
    public Transform roomContainer;
    
    // Added audio configuration
    [Header("Audio Settings")]
    public float backgroundVolume = 0.8f;
    public bool enforceBackgroundSound = true;

    void Start()
    {
        LoadRoom();
    }

    void LoadRoom()
    {
        string filePath = Path.Combine(Application.streamingAssetsPath, "Responses", jsonFileName);

        if (!File.Exists(filePath))
        {
            Debug.LogError("JSON file not found at: " + filePath);
            return;
        }

        string jsonContent = File.ReadAllText(filePath);

        // Debug log to see the JSON content
        Debug.Log("Loading JSON content: " + jsonContent);

        RoomData roomData = JsonUtility.FromJson<RoomData>(jsonContent);

        if (roomData == null)
        {
            Debug.LogError("Failed to parse JSON data");
            return;
        }

        Debug.Log("Room name: " + roomData.environment.name);

        // Create container if not set
        if (roomContainer == null)
        {
            GameObject container = new GameObject("Room");
            roomContainer = container.transform;
        }

        // Calculate room center to use for audio positioning
        Vector3 roomCenter = CalculateRoomCenter(roomData);

        // Create environment shapes (walls, floor, etc)
        if (roomData.environment.shapes != null)
        {
            GameObject envContainer = new GameObject("Environment");
            envContainer.transform.SetParent(roomContainer);

            foreach (ShapeData shape in roomData.environment.shapes)
            {
                CreateShape(shape, envContainer.transform);
            }
        }
        else
        {
            Debug.LogWarning("No environment shapes found in JSON");
        }

        // Create objects
        if (roomData.objects != null)
        {
            GameObject objectsContainer = new GameObject("Objects");
            objectsContainer.transform.SetParent(roomContainer);

            foreach (ShapeData obj in roomData.objects)
            {
                CreateShape(obj, objectsContainer.transform);
            }
        }
        else
        {
            Debug.LogWarning("No objects found in JSON");
        }
        
        // Create the agent
        GameObject agent = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        agent.name = "Agent";
        agent.transform.position = new Vector3(0, 0.5f, 0);
        agent.transform.localScale = Vector3.one * 0.5f;
        agent.AddComponent<AudioSource>();
        agent.AddComponent<AgentController>();
        
        // Create and set up background sound
        StartCoroutine(SetupBackgroundAudio(roomCenter));
    }

    // Calculate the center of the room based on environment objects
    private Vector3 CalculateRoomCenter(RoomData roomData)
    {
        if (roomData.environment == null || roomData.environment.shapes == null || roomData.environment.shapes.Count == 0)
        {
            return Vector3.zero;
        }

        Vector3 sum = Vector3.zero;
        int count = 0;

        // Use all environment shapes with valid positions
        foreach (var shape in roomData.environment.shapes)
        {
            if (shape.position != null)
            {
                sum += new Vector3(shape.position.x, shape.position.y, shape.position.z);
                count++;
            }
        }

        // If no valid positions, return default
        if (count == 0)
        {
            return new Vector3(0, 1.5f, 0);
        }

        // Return the average position
        Vector3 center = sum / count;
        
        // Make sure it's above the ground
        if (center.y < 1.0f)
        {
            center.y = 1.0f;
        }
        
        Debug.Log($"Calculated room center at: {center}");
        return center;
    }

    private IEnumerator SetupBackgroundAudio(Vector3 position)
    {
        // Wait a moment for other systems to initialize
        yield return new WaitForSeconds(1.0f);
        
        // Check if SoundMapper is handling the audio
        SoundMapper soundMapper = FindObjectOfType<SoundMapper>();
        bool soundMapperHandlesAudio = false;
        
        if (soundMapper != null)
        {
            // Give SoundMapper a chance to load
            float waitTime = 0;
            while (!soundMapper.IsReady && waitTime < 5.0f)
            {
                waitTime += 0.5f;
                yield return new WaitForSeconds(0.5f);
            }
            
            // Check if background audio is already set up
            var sources = soundMapper.GetObjectAudioSources();
            if (sources != null && sources.TryGetValue("Background", out AudioSource bgSource) && 
                bgSource != null && bgSource.clip != null)
            {
                Debug.Log("Background sound is handled by SoundMapper");
                
                // Ensure it's positioned correctly
                bgSource.transform.position = position;
                
                // Make sure it's loud enough
                bgSource.volume = Mathf.Max(bgSource.volume, backgroundVolume);
                
                // Force play if needed
                if (!bgSource.isPlaying && enforceBackgroundSound)
                {
                    Debug.Log("Force starting background sound from RoomLoader");
                    bgSource.Play();
                }
                
                soundMapperHandlesAudio = true;
            }
        }
        
        // If SoundMapper isn't handling it, create our own background audio
        if (!soundMapperHandlesAudio && enforceBackgroundSound)
        {
            Debug.Log("SoundMapper not handling background - creating direct audio");
            
            // Create a GameObject for background audio
            GameObject bgObject = new GameObject("DirectBackgroundAudio");
            bgObject.transform.position = position;
            
            // Add audio source
            AudioSource audioSource = bgObject.AddComponent<AudioSource>();
            audioSource.spatialBlend = 0.0f;  // 2D audio
            audioSource.loop = true;
            audioSource.volume = backgroundVolume;
            audioSource.priority = 0;  // Highest priority
            
            // Try to find a background sound file
            yield return StartCoroutine(FindAndLoadBackgroundSound(audioSource));
        }
    }
    
    private IEnumerator FindAndLoadBackgroundSound(AudioSource audioSource)
    {
        string[] possiblePaths = {
            Path.Combine(Application.streamingAssetsPath, "Sounds", "current_scene", "background.mp3"),
            Path.Combine(Application.streamingAssetsPath, "Sounds", "background.mp3"),
            Path.Combine(Application.streamingAssetsPath, "Sounds", "ambient.mp3")
        };
        
        foreach (string path in possiblePaths)
        {
            if (File.Exists(path))
            {
                string uriPath = "file:///" + path.Replace("\\", "/");
                Debug.Log($"Loading background sound from: {uriPath}");
                
                using (UnityEngine.Networking.UnityWebRequest www = UnityEngine.Networking.UnityWebRequestMultimedia.GetAudioClip(uriPath, AudioType.MPEG))
                {
                    yield return www.SendWebRequest();
                    
                    if (www.result == UnityEngine.Networking.UnityWebRequest.Result.Success)
                    {
                        AudioClip clip = UnityEngine.Networking.DownloadHandlerAudioClip.GetContent(www);
                        if (clip != null)
                        {
                            audioSource.clip = clip;
                            audioSource.Play();
                            Debug.Log($"Successfully started background sound: {Path.GetFileName(path)}");
                            
                            // Add monitor component
                            AudioMonitor monitor = audioSource.gameObject.AddComponent<AudioMonitor>();
                            monitor.audioSource = audioSource;
                            
                            yield break;
                        }
                    }
                }
            }
        }
        
        Debug.LogWarning("Could not find any background sound files");
    }

    private void CreateShape(ShapeData shapeData, Transform parent)
    {
        // Debug info
        Debug.Log($"Creating shape: {shapeData.name}, shape: {shapeData.shape}");

        if (shapeData.shape == null)
        {
            Debug.LogError($"Shape type missing for {shapeData.name}");
            return;
        }

        PrimitiveType primitiveType;

        // Determine shape type
        switch (shapeData.shape.ToLower())
        {
            case "cube":
                primitiveType = PrimitiveType.Cube;
                break;
            case "sphere":
                primitiveType = PrimitiveType.Sphere;
                break;
            case "cylinder":
                primitiveType = PrimitiveType.Cylinder;
                break;
            case "capsule":
                primitiveType = PrimitiveType.Capsule;
                break;
            default:
                Debug.LogWarning($"Unknown shape type: {shapeData.shape}");
                return;
        }

        // Create game object
        GameObject newObject = GameObject.CreatePrimitive(primitiveType);
        newObject.name = shapeData.name;
        newObject.transform.SetParent(parent);

        // Set position
        if (shapeData.position != null)
        {
            newObject.transform.position = new Vector3(
                shapeData.position.x,
                shapeData.position.y,
                shapeData.position.z
            );
        }
        else
        {
            Debug.LogWarning($"No position data for {shapeData.name}");
        }

        // Set rotation
        if (shapeData.rotation != null)
        {
            newObject.transform.eulerAngles = new Vector3(
                shapeData.rotation.x,
                shapeData.rotation.y,
                shapeData.rotation.z
            );
        }

        // Set scale
        if (shapeData.size != null)
        {
            newObject.transform.localScale = new Vector3(
                shapeData.size.x,
                shapeData.size.y,
                shapeData.size.z
            );
        }
        else
        {
            Debug.LogWarning($"No size data for {shapeData.name}");
        }

        // Set color
        if (!string.IsNullOrEmpty(shapeData.color))
        {
            Renderer renderer = newObject.GetComponent<Renderer>();

            Color color;
            if (ColorUtility.TryParseHtmlString(shapeData.color, out color))
            {
                renderer.material.color = color;
            }
            else
            {
                Debug.LogWarning($"Could not parse color: {shapeData.color}");
            }
        }
    }
}

// Simple audio monitor to ensure audio keeps playing
public class AudioMonitor : MonoBehaviour
{
    public AudioSource audioSource;
    private float checkInterval = 3.0f;
    private float timer = 0;
    
    private void Start()
    {
        if (audioSource == null)
            audioSource = GetComponent<AudioSource>();
    }
    
    private void Update()
    {
        if (audioSource == null || audioSource.clip == null)
            return;
            
        timer += Time.deltaTime;
        
        if (timer >= checkInterval)
        {
            timer = 0;
            
            if (!audioSource.isPlaying)
            {
                Debug.Log("Audio monitor restarting stopped background sound");
                audioSource.Play();
            }
        }
    }
}