import React from 'react';
import { useParams } from 'react-router-dom';
import { ProjectsApp } from '../ProjectsApp.js';

export const ProjectWorkspace: React.FC = () => {
  const { id, tab } = useParams<{ id: string; tab?: string }>();
  return <ProjectsApp key={`${id}:${tab ?? "overview"}`} autoSelectProjectId={id} autoSelectTab={tab ?? "overview"} />;
};
