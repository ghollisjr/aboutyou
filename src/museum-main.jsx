import React from 'react';
import ReactDOM from 'react-dom/client';
import WanderingMuseum from '../museum-3d.jsx';
import './museum-main.css';

function App() {
  const handleComplete = (results) => {
    console.log('Museum completed!', results);
    alert(
      `Museum Complete!\nMethod: ${results.completionMethod}\nOpenness Score: ${Math.round(results.abstractnessLevel * 100)}%`
    );

    // Send to parent if in iframe
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'MUSEUM_COMPLETE', data: results }, '*');
    }
  };

  return <WanderingMuseum onComplete={handleComplete} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
