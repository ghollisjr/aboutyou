import React from 'react';
import ReactDOM from 'react-dom/client';
import WanderingMuseum from '../museum-3d.jsx';
import './museum-main.css';

function App() {
  const handleComplete = (results) => {
    console.log('Museum completed!', results);

    // Send to parent if in iframe
    if (window.parent !== window) {
      window.parent.postMessage({ type: 'MUSEUM_COMPLETE', data: results }, '*');
    }

    // Store results for this session
    sessionStorage.setItem('museum_played', '1');
    sessionStorage.setItem('museum_results', JSON.stringify(results));

    // Navigate back to main page
    window.location.href = '../index.html';
  };

  return <WanderingMuseum onComplete={handleComplete} />;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
