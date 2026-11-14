import { Gate } from './components/hud/Gate';
import { BossCard, CountPanel, Header } from './components/hud/Hud';
import { DailyDump } from './components/news/DailyDump';
import { Tutorial } from './components/hud/Tutorial';
import { Announcer } from './components/hud/Announcer';
import { Scene } from './components/scene/Scene';

export default function App() {
  return (
    <div className="page">
      <div className="wrap">
        <Header />
        <div className="main-row">
          <div className="left-col">
            <Scene />
            <div className="hud-row">
              <BossCard />
              <CountPanel />
            </div>
          </div>
          <DailyDump />
        </div>
      </div>
      <Gate />
      <Tutorial />
      <Announcer />
    </div>
  );
}
