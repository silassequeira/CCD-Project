using System.Collections;
using UnityEngine;
using TMPro;
using UnityEngine.UI;

public class PipelineUIController : MonoBehaviour
{
    [Header("Pipeline Reference")]
    [SerializeField] private PipelineManager pipelineManager;
    
    [Header("UI Components")]
    [SerializeField] private GameObject loadingPanel;
    [SerializeField] private TextMeshProUGUI loadingStepText;
    [SerializeField] private TextMeshProUGUI loadingTimeText;
    [SerializeField] private Image progressBarFill;
    
    [Header("Animation Settings")]
    [SerializeField] private float pulsateSpeed = 1f;
    [SerializeField] private float pulsateMin = 0.7f;
    [SerializeField] private float pulsateMax = 1.0f;
    [SerializeField] private Transform loadingIcon;
    [SerializeField] private float rotationSpeed = 50f;
    
    private bool isAnimating = false;
    private Coroutine animationCoroutine;
    
    private void Start()
    {
        if (pipelineManager == null)
        {
            pipelineManager = FindObjectOfType<PipelineManager>();
        }
        
        if (loadingPanel != null)
        {
            loadingPanel.SetActive(false);
        }
    }
    
    public void ShowLoadingUI(bool show)
    {
        if (loadingPanel != null)
        {
            loadingPanel.SetActive(show);
        }
        
        if (show && !isAnimating)
        {
            StartAnimations();
        }
        else if (!show && isAnimating)
        {
            StopAnimations();
        }
    }
    
    public void UpdateProgressUI(string step, int elapsedSeconds, float progress)
    {
        if (loadingStepText != null)
        {
            loadingStepText.text = step;
        }
        
        if (loadingTimeText != null)
        {
            loadingTimeText.text = $"Time: {elapsedSeconds}s";
        }
        
        if (progressBarFill != null)
        {
            progressBarFill.fillAmount = progress;
        }
    }
    
    private void StartAnimations()
    {
        isAnimating = true;
        if (animationCoroutine != null)
        {
            StopCoroutine(animationCoroutine);
        }
        animationCoroutine = StartCoroutine(AnimateUI());
    }
    
    private void StopAnimations()
    {
        isAnimating = false;
        if (animationCoroutine != null)
        {
            StopCoroutine(animationCoroutine);
            animationCoroutine = null;
        }
    }
    
    private IEnumerator AnimateUI()
    {
        float t = 0;
        
        while (isAnimating)
        {
            t += Time.deltaTime * pulsateSpeed;
            
            // Pulsate any UI elements
            if (progressBarFill != null)
            {
                Color color = progressBarFill.color;
                color.a = Mathf.Lerp(pulsateMin, pulsateMax, (Mathf.Sin(t * 3f) + 1f) * 0.5f);
                progressBarFill.color = color;
            }
            
            // Rotate loading icon
            if (loadingIcon != null)
            {
                loadingIcon.Rotate(0, 0, -rotationSpeed * Time.deltaTime);
            }
            
            yield return null;
        }
    }
    
    public void OnGenerateButtonClicked()
    {
        if (pipelineManager != null)
        {
            pipelineManager.StartPipeline();
        }
    }
}