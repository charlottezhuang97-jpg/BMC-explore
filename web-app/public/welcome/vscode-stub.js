// VS Code API stub for standalone web context
function acquireVsCodeApi() {
  return {
    postMessage: function(msg) {
      if (msg.type === 'selectRole' && ['machine_developer', 'component_developer'].includes(msg.role)) {
        window.dispatchEvent(new MessageEvent('message', { data: { type: 'updateRole', role: msg.role, roleName: msg.role === 'machine_developer' ? '整机开发者' : '部件开发者' } }));
      }
      if (msg.command === 'openLink' && msg.url) {
        window.open(msg.url, '_blank', 'noopener,noreferrer');
      }
      // All other commands (openFile, newFile, update, workflowAction, etc.)
      // are no-ops in the web app context
    },
    getState: function() { return null; },
    setState: function() {},
  };
}

// FeatureDialog stub — feature dialog is not ported to the web app
var FeatureDialog = {
  init: function() {},
  show: function() {},
};
