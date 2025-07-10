import React, { useState, useEffect } from 'react';
import { useAuthContext } from '../../contexts/AuthContext';
import { observability } from '../../../services/observabilityService';
import { promptManager, PromptTemplate } from '../../services/promptManager';


export const PromptManager: React.FC = () => {
  const { user } = useAuthContext();
  const [prompts, setPrompts] = useState<PromptTemplate[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<PromptTemplate | null>(null);
  const [editedContent, setEditedContent] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'screener' | 'analysis' | 'trader'>('all');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Check if user is authorized admin
  const isAuthorized = user?.email === 'tom@tomk.ca';

  // Load prompts on mount
  useEffect(() => {
    const loadPrompts = async () => {
      try {
        const allPrompts = await promptManager.getAllPrompts();
        setPrompts(allPrompts);
        setLoadError(null);
      } catch (error) {
        console.error('Failed to load prompts:', error);
        setLoadError(error instanceof Error ? error.message : 'Failed to load prompts');
      } finally {
        setLoading(false);
      }
    };
    
    loadPrompts();
  }, []);

  useEffect(() => {
    if (selectedPrompt) {
      setEditedContent(selectedPrompt.systemInstruction);
    }
  }, [selectedPrompt]);

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center">
          <h2 className="text-2xl font-bold text-red-500 mb-2">Access Denied</h2>
          <p className="text-gray-400">You are not authorized to access this page.</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-gray-400">Loading prompts...</div>
      </div>
    );
  }

  const filteredPrompts = prompts.filter(
    prompt => activeCategory === 'all' || prompt.category === activeCategory
  );

  const handleSave = async () => {
    if (!selectedPrompt) return;
    
    setSaveStatus('saving');
    try {
      // Track the prompt update
      observability.track('prompt_updated', {
        promptId: selectedPrompt.id,
        category: selectedPrompt.category,
        version: selectedPrompt.version + 1
      });

      // Save to prompt manager
      const success = await promptManager.savePromptOverride(
        selectedPrompt.id,
        editedContent,
        user?.email || 'unknown'
      );
      
      if (!success) {
        throw new Error('Failed to save prompt');
      }
      
      // Reload prompts to get updated version
      const updatedPrompts = await promptManager.getAllPrompts();
      setPrompts(updatedPrompts);
      
      // Update selected prompt with new version
      const updatedPrompt = updatedPrompts.find(p => p.id === selectedPrompt.id);
      if (updatedPrompt) {
        setSelectedPrompt(updatedPrompt);
      }
      
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (error) {
      console.error('Failed to save prompt:', error);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus('idle'), 3000);
    }
  };

  const handleRevert = () => {
    if (selectedPrompt) {
      setEditedContent(selectedPrompt.systemInstruction);
    }
  };

  return (
    <div className="flex h-screen bg-gray-900 text-gray-100">
      {/* Sidebar */}
      <div className="w-80 bg-gray-800 border-r border-gray-700 overflow-y-auto">
        <div className="p-4">
          <h2 className="text-2xl font-bold mb-4 text-gray-100">Prompt Manager</h2>
          
          {/* Error message if prompts failed to load */}
          {loadError && (
            <div className="mb-4 p-3 bg-red-900/20 border border-red-600 rounded-lg">
              <div className="flex items-start gap-2">
                <svg className="w-5 h-5 text-red-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <div className="flex-1">
                  <p className="text-sm font-medium text-red-500">Failed to Load Prompts</p>
                  <p className="text-xs text-red-400 mt-1">
                    {loadError}
                  </p>
                  <div className="mt-2">
                    <button
                      onClick={async () => {
                        setLoading(true);
                        setLoadError(null);
                        try {
                          await promptManager.reload();
                          const allPrompts = await promptManager.getAllPrompts();
                          setPrompts(allPrompts);
                        } catch (error) {
                          setLoadError(error instanceof Error ? error.message : 'Failed to load prompts');
                        } finally {
                          setLoading(false);
                        }
                      }}
                      className="text-xs px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Category Filter */}
          <div className="mb-4">
            <div className="flex flex-wrap gap-2">
              {(['all', 'screener', 'analysis', 'trader'] as const).map(category => (
                <button
                  key={category}
                  onClick={() => setActiveCategory(category)}
                  className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                    activeCategory === category
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                  }`}
                >
                  {category.charAt(0).toUpperCase() + category.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Prompt List */}
          <div className="space-y-2">
            {filteredPrompts.map(prompt => (
              <div
                key={prompt.id}
                onClick={() => setSelectedPrompt(prompt)}
                className={`p-3 rounded-lg cursor-pointer transition-colors ${
                  selectedPrompt?.id === prompt.id
                    ? 'bg-gray-700 border border-blue-500'
                    : 'bg-gray-800 hover:bg-gray-700 border border-transparent'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <h3 className="font-medium text-gray-100">{prompt.name}</h3>
                    <p className="text-sm text-gray-400 mt-1">{prompt.description}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className={`text-xs px-2 py-1 rounded-full ${
                        prompt.category === 'screener' ? 'bg-blue-600/20 text-blue-400' :
                        prompt.category === 'analysis' ? 'bg-green-600/20 text-green-400' :
                        'bg-purple-600/20 text-purple-400'
                      }`}>
                        {prompt.category}
                      </span>
                      <span className="text-xs text-gray-500">v{prompt.version}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col">
        {selectedPrompt ? (
          <>
            {/* Header */}
            <div className="bg-gray-800 border-b border-gray-700 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-xl font-semibold">{selectedPrompt.name}</h3>
                  <p className="text-sm text-gray-400 mt-1">{selectedPrompt.description}</p>
                  <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                    <span>Last modified: {selectedPrompt.lastModified.toLocaleString()}</span>
                    <span>Version: {selectedPrompt.version}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRevert}
                    className="px-4 py-2 bg-gray-700 text-gray-300 rounded-md hover:bg-gray-600 transition-colors"
                  >
                    Revert
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={editedContent === selectedPrompt.systemInstruction || saveStatus === 'saving'}
                    className={`px-4 py-2 rounded-md font-medium transition-colors ${
                      editedContent === selectedPrompt.systemInstruction || saveStatus === 'saving'
                        ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                        : 'bg-blue-600 text-white hover:bg-blue-700'
                    }`}
                  >
                    {saveStatus === 'saving' ? 'Saving...' : 
                     saveStatus === 'saved' ? 'Saved!' :
                     saveStatus === 'error' ? 'Error!' : 'Save'}
                  </button>
                </div>
              </div>
            </div>

            {/* Parameters Info */}
            {selectedPrompt.parameters && (
              <div className="bg-gray-800 border-b border-gray-700 p-4">
                <h4 className="text-sm font-medium text-gray-400 mb-2">Parameters:</h4>
                <div className="flex flex-wrap gap-2">
                  {selectedPrompt.parameters.map(param => (
                    <code key={param} className="text-xs bg-gray-700 text-gray-300 px-2 py-1 rounded">
                      {param}
                    </code>
                  ))}
                </div>
              </div>
            )}

            {/* Editor */}
            <div className="flex-1 p-4">
              <textarea
                value={editedContent}
                onChange={(e) => setEditedContent(e.target.value)}
                className="w-full h-full bg-gray-800 text-gray-100 rounded-lg p-4 font-mono text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 border border-gray-700"
                spellCheck={false}
                placeholder="Enter system instruction here..."
              />
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-gray-500">
            <div className="text-center">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-lg">Select a prompt template to edit</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};