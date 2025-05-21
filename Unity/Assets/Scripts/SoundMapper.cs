using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using UnityEngine;

public class SoundMapper : MonoBehaviour
{
    [Header("Configuration")]
    public string soundMappingsFileName = "unity_sound_mappings.json";
    public string soundsFolderPath = "Sounds";
    public string sceneFolderName = "current_scene";

    [Header("Audibility Settings")]
[Range(0f, 1f)]
public float minBackgroundVolume = 0.15f;

[Range(0f, 1f)]
public float minInteractionVolume = 0.3f;

    [Header("Sound Settings")]
    [Range(0f, 1f)]
    public float globalVolume = 0.8f;

    [Range(0f, 1f)]
    public float spatialBlend = 0.8f;

    public float maxDistance = 20f;

    // Dictionary of objects with associated sounds
    private Dictionary<string, AudioSource> objectAudioSources = new Dictionary<string, AudioSource>();
    private AudioSource backgroundSource;
    
    public bool IsReady { get; private set; } = false;
    private SoundMappingData soundMappings;

    void Awake()
    {
        // Create a GameObject for this component if it doesn't exist
        if (GameObject.Find("SoundManager") == null)
        {
            gameObject.name = "SoundManager";
            DontDestroyOnLoad(gameObject);
        }
    }

    void Start()
    {
        StartCoroutine(InitSoundMapping());
    }

    IEnumerator InitSoundMapping()
    {
        yield return new WaitForEndOfFrame();
        LoadSoundMappings();
        ApplySoundsToSceneObjects();
        IsReady = true;
    }

    void LoadSoundMappings()
    {
        string filePath = Path.Combine(Application.streamingAssetsPath, soundMappingsFileName);
        if (!File.Exists(filePath))
        {
            Debug.LogError("Sound mapping file not found: " + filePath);
            return;
        }

        string jsonContent = File.ReadAllText(filePath);
        try
        {
            soundMappings = JsonUtility.FromJson<SoundMappingData>(jsonContent);

            if (soundMappings == null || soundMappings.soundMappings == null || soundMappings.soundMappings.Count == 0)
            {
                Debug.LogError("Error reading sound mappings or empty file.");
                return;
            }

            Debug.Log($"Loaded {soundMappings.soundMappings.Count} sound mappings.");
            
            // Debug output to verify JSON parsing
            foreach (var mapping in soundMappings.soundMappings)
            {
                Debug.Log($"Sound mapping: {mapping.title} for {mapping.objectName}, type: {mapping.type}, file: {mapping.filename}");
            }
        }
        catch (Exception ex)
        {
            Debug.LogError($"Failed to parse sound mappings: {ex.Message}");
        }
    }

void ApplySoundsToSceneObjects()
{
    if (soundMappings == null || soundMappings.soundMappings == null)
        return;

    // Get all objects in the scene by name
    Dictionary<string, GameObject> sceneObjects = new Dictionary<string, GameObject>();
    
    foreach (GameObject obj in GameObject.FindObjectsOfType<GameObject>())
    {
        if (!sceneObjects.ContainsKey(obj.name))
        {
            sceneObjects.Add(obj.name, obj);
        }
    }

    Debug.Log($"Found {sceneObjects.Count} objects in scene");
    
    // Always create a background audio source first
    GameObject bgObject = new GameObject("BackgroundAudio");
    backgroundSource = bgObject.AddComponent<AudioSource>();
    backgroundSource.spatialBlend = 0f; // 2D sound for background
    backgroundSource.loop = true;
    backgroundSource.playOnAwake = true;
    objectAudioSources["Background"] = backgroundSource;
    
    // Position the background audio at camera/player position
    Vector3 listenerPos = Camera.main != null ? Camera.main.transform.position : Vector3.zero;
    bgObject.transform.position = listenerPos;

    // Process each sound mapping
    foreach (SoundMapping mapping in soundMappings.soundMappings)
    {
        if (string.IsNullOrEmpty(mapping.filename))
        {
            Debug.LogWarning($"No filename specified for mapping: {mapping.title ?? "Unnamed"}");
            continue;
        }

        // Special handling for background sounds
        if (mapping.type != null && mapping.type.ToLower() == "background")
        {
            Debug.Log($"Processing background sound: {mapping.title}, file: {mapping.filename}");
            
            // Ensure background is audible with a minimum volume
            float baseVolume = mapping.volume;
            backgroundSource.volume = Mathf.Max(minBackgroundVolume, baseVolume * globalVolume);
            
            // Force background to play on start
            StartCoroutine(LoadAndAssignAudioClip(backgroundSource, mapping.filename, true));
            Debug.Log($"Background sound assigned: {mapping.title}, Volume: {backgroundSource.volume}");
            continue;
        }
        
        // Handle object sounds - first check if the object exists
        if (string.IsNullOrEmpty(mapping.objectName))
        {
            Debug.LogWarning($"No object name specified for mapping: {mapping.title}");
            continue;
        }

        GameObject targetObject = null;
        sceneObjects.TryGetValue(mapping.objectName, out targetObject);
        
        if (targetObject == null)
        {
            Debug.LogWarning($"Object not found in scene: {mapping.objectName}");
            continue;
        }

        // Add or get AudioSource component
        AudioSource source = targetObject.GetComponent<AudioSource>();
        if (source == null)
        {
            source = targetObject.AddComponent<AudioSource>();
        }
        
        // Configure the audio source
        source.playOnAwake = false;
        source.loop = mapping.loop;
        
        // For interaction sounds, ensure minimum volume
        float objectBaseVolume = mapping.volume;
        source.volume = Mathf.Max(minInteractionVolume, objectBaseVolume * globalVolume);
        
        source.spatialBlend = spatialBlend;
        source.rolloffMode = AudioRolloffMode.Linear;
        source.maxDistance = maxDistance;
        
        // Load the audio clip
        StartCoroutine(LoadAndAssignAudioClip(source, mapping.filename, false));
        
        // Register in our dictionary
        objectAudioSources[mapping.objectName] = source;
        Debug.Log($"Sound assigned to {mapping.objectName}: {mapping.title}, Volume: {source.volume}");
    }

    // Add a background sound monitor to ensure it keeps playing
    if (backgroundSource != null)
    {
        BackgroundSoundMonitor monitor = bgObject.AddComponent<BackgroundSoundMonitor>();
        monitor.Initialize(backgroundSource);
        Debug.Log("Added background sound monitor");
    }
}

    IEnumerator LoadAndAssignAudioClip(AudioSource audioSource, string filename, bool playWhenLoaded)
    {
        if (string.IsNullOrEmpty(filename))
        {
            Debug.LogError("Filename is null or empty");
            yield break;
        }

        // First check in scene-specific folder
        string sceneFolder = Path.Combine(Application.streamingAssetsPath, soundsFolderPath, sceneFolderName);
        string baseFolder = Path.Combine(Application.streamingAssetsPath, soundsFolderPath);
        string filePath = null;

        Debug.Log($"Looking for audio file: {filename}");
        Debug.Log($"Scene folder path: {sceneFolder}");
        Debug.Log($"Base folder path: {baseFolder}");

        // Find the file path
        try
        {
            // First try scene folder with exact filename
            string scenePath = Path.Combine(sceneFolder, filename);
            if (File.Exists(scenePath))
            {
                filePath = scenePath;
                Debug.Log($"Found audio file in scene folder: {filePath}");
            }
            else
            {
                // Then try base folder with exact filename
                string basePath = Path.Combine(baseFolder, filename);
                if (File.Exists(basePath))
                {
                    filePath = basePath;
                    Debug.Log($"Found audio file in base folder: {filePath}");
                }
                else
                {
                    // Finally, search recursively
                    try
                    {
                        string[] foundFiles = Directory.GetFiles(baseFolder, filename, SearchOption.AllDirectories);
                        if (foundFiles.Length > 0)
                        {
                            filePath = foundFiles[0];
                            Debug.Log($"Found audio file by search: {filePath}");
                        }
                        else
                        {
                            Debug.LogWarning($"File not found in any folder: {filename}");
                        }
                    }
                    catch (Exception searchEx)
                    {
                        Debug.LogError($"Error searching for file: {searchEx.Message}");
                    }
                }
            }
        }
        catch (Exception e)
        {
            Debug.LogError($"Error searching for audio file: {e.Message}");
            yield break;
        }

        if (filePath == null)
        {
            Debug.LogError($"Audio file not found: {filename}");
            yield break;
        }

        // Get file extension to determine audio type
        string extension = Path.GetExtension(filePath).ToLowerInvariant();
        AudioType audioType = GetAudioType(extension);
        
        if (audioType == AudioType.UNKNOWN)
        {
            Debug.LogError($"Unsupported audio format: {extension}. Only .wav and .mp3 are supported.");
            yield break;
        }

        // Create URI path based on platform
        string uriPath = "file:///" + filePath.Replace("\\", "/");
        Debug.Log($"Loading audio from: {uriPath}");

        using (UnityEngine.Networking.UnityWebRequest www = UnityEngine.Networking.UnityWebRequestMultimedia.GetAudioClip(uriPath, audioType))
        {
            yield return www.SendWebRequest();

            if (www.result != UnityEngine.Networking.UnityWebRequest.Result.Success)
            {
                Debug.LogError($"Error loading audio {filename}: {www.error}");
                yield break;
            }

            AudioClip clip = UnityEngine.Networking.DownloadHandlerAudioClip.GetContent(www);
            
            if (clip == null)
            {
                Debug.LogError($"Failed to load audio clip: {filename} - clip is null");
                yield break;
            }
            
            if (clip.loadState != AudioDataLoadState.Loaded)
            {
                Debug.LogError($"Failed to load audio clip: {filename} - state: {clip.loadState}");
                yield break;
            }

            // Successfully loaded
            clip.name = Path.GetFileNameWithoutExtension(filename);
            audioSource.clip = clip;
            Debug.Log($"Successfully loaded audio: {filename} ({clip.length}s)");

            if (playWhenLoaded && !audioSource.isPlaying)
            {
                audioSource.Play();
                Debug.Log($"Started playing: {filename}");
            }
        }
    }

    AudioType GetAudioType(string extension)
    {
        switch (extension)
        {
            case ".mp3": return AudioType.MPEG;
            case ".wav": return AudioType.WAV;
            case ".ogg": return AudioType.OGGVORBIS;
            case ".aiff":
            case ".aif": return AudioType.AIFF;
            default: return AudioType.UNKNOWN;
        }
    }

    public Dictionary<string, AudioSource> GetObjectAudioSources()
    {
        return objectAudioSources;
    }

    public void PlaySoundForObject(string objectName)
    {
        if (objectAudioSources.TryGetValue(objectName, out AudioSource source))
        {
            if (source != null && source.clip != null && !source.isPlaying)
            {
                source.Play();
                Debug.Log($"Playing sound for {objectName}");
            }
        }
        else
        {
            Debug.LogWarning($"No audio source found for {objectName}");
        }
    }

    public void StopAllSounds()
    {
        foreach (var source in objectAudioSources.Values)
        {
            if (source != null && source.isPlaying)
            {
                source.Stop();
            }
        }
    }
}