import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { EditorPage } from './components/Editor/EditorPage';

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/editor/demo" replace />} />
      <Route path="/editor/:projectId" element={<EditorPage />} />
    </Routes>
  );
}
