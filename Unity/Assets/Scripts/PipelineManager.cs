using System;
using System.Collections;
using System.Text;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.Networking;
using TMPro;

public class PipelineManager : MonoBehaviour
{
    [Header("API Settings")]
    [SerializeField] private string serverUrl = "http://localhost:3000";
    [SerializeField] private float statusCheckInterval = 1.0f;
    
    [Header("UI Elements")]
    [SerializeField] private Button generateButton;
    [SerializeField] private TextMeshProUGUI loadingText;
    
    private bool isPipelineRunning = false;
    private Coroutine statusCheckCoroutine;
    private string sessionCookie = null;
    private bool isAuthenticated = false;
    private string authToken = null;

    private void Start()
    {
        // Initialize UI elements
        if (generateButton != null)
        {
            generateButton.onClick.AddListener(StartPipeline);
            generateButton.interactable = false; // Disable until we check auth
        }

        if (loadingText != null)
        {
            loadingText.gameObject.SetActive(true);
            loadingText.text = "Connecting to server...";
        }

        // Initial server check and auth
        StartCoroutine(Initialize());
    }
    
    private IEnumerator Initialize()
    {
        // First check if server is running
        yield return StartCoroutine(CheckServerStatus());
        
        // Then authenticate directly
        yield return StartCoroutine(Authenticate());
        
        // Check if pipeline is already running
        yield return StartCoroutine(CheckPipelineStatus());
        
        // Enable button if all is well
        if (generateButton != null && isAuthenticated)
        {
            generateButton.interactable = true;
        }
        
        if (loadingText != null)
        {
            if (isAuthenticated)
            {
                loadingText.gameObject.SetActive(false);
            }
            else
            {
                loadingText.text = "Not authenticated. Click Generate to login.";
                loadingText.color = Color.yellow;
            }
        }
    }
    
    private IEnumerator CheckServerStatus()
    {
        using (UnityWebRequest request = UnityWebRequest.Get($"{serverUrl}/api/status"))
        {
            yield return request.SendWebRequest();
            
            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError("Server connection failed: " + request.error);
                if (loadingText != null)
                {
                    loadingText.gameObject.SetActive(true);
                    loadingText.text = "Server connection failed";
                    loadingText.color = Color.red;
                }
                yield break;
            }
            
            Debug.Log("Server connection successful");
        }
    }
    
    private IEnumerator Authenticate()
    {
        if (loadingText != null)
        {
            loadingText.text = "Authenticating...";
            loadingText.color = Color.white;
        }
        
        // Try direct token exchange
        using (UnityWebRequest request = new UnityWebRequest($"{serverUrl}/api/auth/unity-token", "POST"))
        {
            request.downloadHandler = new DownloadHandlerBuffer();
            request.uploadHandler = new UploadHandlerRaw(new byte[0]);
            request.SetRequestHeader("Content-Type", "application/json");
            
            yield return request.SendWebRequest();
            
            if (request.result == UnityWebRequest.Result.Success)
            {
                string responseText = request.downloadHandler.text;
                Debug.Log("Auth response: " + responseText);
                
                try
                {
                    TokenResponse response = JsonUtility.FromJson<TokenResponse>(responseText);
                    if (response.success && response.authenticated)
                    {
                        // Store token and cookie
                        authToken = response.token;
                        isAuthenticated = true;
                        
                        string setCookieHeader = request.GetResponseHeader("Set-Cookie");
                        if (!string.IsNullOrEmpty(setCookieHeader))
                        {
                            sessionCookie = setCookieHeader;
                        }
                        
                        Debug.Log("Successfully authenticated with token");
                        
                        // We're done
                        yield break;
                    }
                }
                catch (Exception e)
                {
                    Debug.LogError("Error parsing auth response: " + e.Message);
                }
            }
        }
    }
    
    public void StartPipeline()
    {
        if (isPipelineRunning)
        {
            Debug.LogWarning("Pipeline is already running");
            return;
        }
        
        if (!isAuthenticated)
        {
            // Not authenticated, try to authenticate first
            StartCoroutine(AuthenticateAndStartPipeline());
        }
        else
        {
            // Already authenticated, start pipeline directly
            StartCoroutine(TriggerPipelineGeneration());
        }
    }
    
    private IEnumerator AuthenticateAndStartPipeline()
    {
        if (loadingText != null)
        {
            loadingText.gameObject.SetActive(true);
            loadingText.text = "Opening browser for authentication...";
        }
        
        // Open browser for login
        Application.OpenURL($"{serverUrl}/freesound/login");
        
        if (loadingText != null)
        {
            loadingText.text = "Please log in with your browser.\nClick Generate again after login.";
        }
        
        yield break;
    }
    
    private IEnumerator TriggerPipelineGeneration()
    {
        // Prepare UI
        if (generateButton != null)
        {
            generateButton.interactable = false;
        }
        
        if (loadingText != null)
        {
            loadingText.gameObject.SetActive(true);
            loadingText.text = "Starting generation...";
            loadingText.color = Color.white;
        }
        
        // Create web request
        using (UnityWebRequest request = new UnityWebRequest($"{serverUrl}/api/generate/pipeline", "POST"))
        {
            request.downloadHandler = new DownloadHandlerBuffer();
            request.uploadHandler = new UploadHandlerRaw(new byte[0]);
            request.SetRequestHeader("Content-Type", "application/json");
            
            // Add direct token
            if (!string.IsNullOrEmpty(authToken))
            {
                request.SetRequestHeader("Authorization", "Bearer " + authToken);
            }
            
            // Also add session cookie if available
            if (!string.IsNullOrEmpty(sessionCookie))
            {
                request.SetRequestHeader("Cookie", sessionCookie);
            }
            
            yield return request.SendWebRequest();
            
            if (request.result != UnityWebRequest.Result.Success)
            {
                Debug.LogError("Failed to start pipeline: " + request.error);
                string responseText = request.downloadHandler.text;
                Debug.LogError("Response: " + responseText);
                
                // Check if authentication error
                if (request.responseCode == 401)
                {
                    isAuthenticated = false;
                    
                    // Start authentication process
                    StartCoroutine(AuthenticateAndStartPipeline());
                }
                else
                {
                    if (loadingText != null)
                    {
                        loadingText.text = "Generation failed: " + request.error;
                        loadingText.color = Color.red;
                    }
                    
                    if (generateButton != null)
                    {
                        generateButton.interactable = true;
                    }
                }
                
                yield break;
            }
            
            // Store cookies if available
            string cookies = request.GetResponseHeader("Set-Cookie");
            if (!string.IsNullOrEmpty(cookies))
            {
                sessionCookie = cookies;
                Debug.Log("Session cookie updated from pipeline request");
            }
            
            // Pipeline started successfully
            isPipelineRunning = true;
            
            if (statusCheckCoroutine != null)
            {
                StopCoroutine(statusCheckCoroutine);
            }
            
            statusCheckCoroutine = StartCoroutine(CheckPipelineStatus());
        }
    }
    
    private IEnumerator CheckPipelineStatus()
    {
        while (true)
        {
            using (UnityWebRequest request = UnityWebRequest.Get($"{serverUrl}/api/generate/status"))
            {
                // Add session cookie if available
                if (!string.IsNullOrEmpty(sessionCookie))
                {
                    request.SetRequestHeader("Cookie", sessionCookie);
                }
                
                yield return request.SendWebRequest();
                
                if (request.result != UnityWebRequest.Result.Success)
                {
                    Debug.LogError("Failed to check pipeline status: " + request.error);
                }
                else
                {
                    // Store cookies if available
                    string cookies = request.GetResponseHeader("Set-Cookie");
                    if (!string.IsNullOrEmpty(cookies))
                    {
                        sessionCookie = cookies;
                    }
                    
                    string responseText = request.downloadHandler.text;
                    PipelineStatusResponse status = JsonUtility.FromJson<PipelineStatusResponse>(responseText);
                    
                    isPipelineRunning = status.running;
                    
                    if (loadingText != null)
                    {
                        if (isPipelineRunning)
                        {
                            loadingText.gameObject.SetActive(true);
                            loadingText.text = $"Loading: {status.currentStep} ({status.progress * 100:0}%)";
                        }
                        else if (status.currentStep != null && status.currentStep.StartsWith("Error"))
                        {
                            loadingText.gameObject.SetActive(true);
                            loadingText.text = "Error: Generation failed";
                            loadingText.color = Color.red;
                        }
                        else if (status.progress >= 1.0f)
                        {
                            loadingText.gameObject.SetActive(true);
                            loadingText.text = "Generation complete!";
                            loadingText.color = Color.green;
                        }
                        else
                        {
                            loadingText.gameObject.SetActive(false);
                        }
                    }
                    
                    if (!isPipelineRunning)
                    {
                        if (generateButton != null)
                        {
                            generateButton.interactable = true;
                        }
                        
                        // If completed successfully, trigger scene reload
                        if (status.progress >= 1.0f)
                        {
                            yield return new WaitForSeconds(2.0f); // Wait a bit to show completion
                            UnityEngine.SceneManagement.SceneManager.LoadScene(
                                UnityEngine.SceneManagement.SceneManager.GetActiveScene().name);
                        }
                        
                        break;
                    }
                }
            }
            
            yield return new WaitForSeconds(statusCheckInterval);
        }
    }
    
    private void OnDestroy()
    {
        if (statusCheckCoroutine != null)
        {
            StopCoroutine(statusCheckCoroutine);
        }
    }

    [Serializable]
    private class TokenResponse
    {
        public bool success;
        public bool authenticated;
        public string token;
        public string message;
    }
    
    [Serializable]
    private class PipelineResponse
    {
        public bool success;
        public string message;
        public string status;
        public string error;
        public string redirect;
    }
    
    [Serializable]
    private class PipelineStatusResponse
    {
        public bool running;
        public int elapsedSeconds;
        public string currentStep;
        public float progress;
    }
    
    [Serializable]
    private class AuthStatus
    {
        public bool authenticated;
        public string loginUrl;
    }
}