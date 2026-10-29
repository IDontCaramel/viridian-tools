import { lazy, Suspense, useState } from 'react'
import type { Project } from './model/project'
import { StartScreen } from './components/StartScreen'
const Workspace = lazy(() => import('./components/Workspace').then((module) => ({ default: module.Workspace })))

export function App() {
  const [project, setProject] = useState<Project | null>(null)
  return project ? (
    <Suspense
      fallback={
        <p className="notice" role="status">
          Opening editor…
        </p>
      }
    >
      <Workspace key={project.id} project={project} onClose={() => setProject(null)} />
    </Suspense>
  ) : (
    <StartScreen onOpen={setProject} />
  )
}
