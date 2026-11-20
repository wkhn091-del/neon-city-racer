import { MainMenu } from './components/MainMenu'
import { GameCanvas } from './components/GameCanvas'
import { HUD } from './components/HUD'
import { InstallBanner } from './components/InstallBanner'
import { useGameStore } from './store/gameStore'
import './App.css'

export default function App() {
  const screen = useGameStore((s) => s.screen)

  return (
    <div className="app">
      <pre id="qa-stats" hidden aria-hidden="true" />
      <InstallBanner />
      {screen === 'menu' ? (
        <MainMenu />
      ) : (
        <>
          <GameCanvas />
          <HUD />
        </>
      )}
    </div>
  )
}
