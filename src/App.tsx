import { MainMenu } from './components/MainMenu'
import { GameCanvas } from './components/GameCanvas'
import { HUD } from './components/HUD'
import { useGameStore } from './store/gameStore'
import './App.css'

export default function App() {
  const screen = useGameStore((s) => s.screen)

  return (
    <div className="app">
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
