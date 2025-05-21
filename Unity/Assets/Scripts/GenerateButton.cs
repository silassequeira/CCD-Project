using UnityEngine;
using UnityEngine.UI;

[RequireComponent(typeof(Button))]
public class GenerateButton : MonoBehaviour
{
    [SerializeField] private PipelineManager pipelineManager;
    
    private Button button;
    
    private void Start()
    {
        button = GetComponent<Button>();
        
        if (pipelineManager == null)
        {
            pipelineManager = FindObjectOfType<PipelineManager>();
        }
        
        if (pipelineManager != null)
        {
            button.onClick.AddListener(pipelineManager.StartPipeline);
        }
        else
        {
            Debug.LogError("PipelineManager not found! Please assign it in the inspector.");
            button.interactable = false;
        }
    }
}