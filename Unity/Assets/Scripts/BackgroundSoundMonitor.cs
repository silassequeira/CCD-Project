using UnityEngine;

public class BackgroundSoundMonitor : MonoBehaviour
{
    private AudioSource backgroundSource;
    private float checkInterval = 5.0f;
    private float elapsedTime = 0f;
    
    public void Initialize(AudioSource source)
    {
        backgroundSource = source;
    }
    
    void Update()
    {
        if (backgroundSource == null) return;
        
        elapsedTime += Time.deltaTime;
        
        if (elapsedTime >= checkInterval)
        {
            elapsedTime = 0f;
            
            // Check if background should be playing but isn't
            if (backgroundSource.clip != null && !backgroundSource.isPlaying)
            {
                Debug.Log("Restarting background audio that stopped playing");
                backgroundSource.Play();
            }
        }
    }
}