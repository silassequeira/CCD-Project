using System;
using System.Collections.Generic;

[Serializable]
public class SoundMapping
{
    public string title;
    public string type;
    public string objectName; // Changed from "object" to "objectName"
    public string filename;
    public float duration;
    public bool loop;
    public float volume = 0.5f; // Add default value
    public float loudness = 0.5f; // Add default value
}

[Serializable]
public class SoundMappingData
{
    public List<SoundMapping> soundMappings = new List<SoundMapping>();
}