import { useEffect, useState } from 'react';
import { UrlConfig } from '@/types/url-config';
import { Layers } from 'lucide-react';
import { useAppStore } from '@/store/appStore';
import { sceneMembers } from '@/utils/scenes';
import { siteIcon, windowIcon } from '@/services/icons';

export function TargetIcon({ config, active = false, small = false }: { config: Pick<UrlConfig, 'type' | 'url' | 'name' | 'windowInfo' | 'memberIds'>; active?: boolean; small?: boolean }) {
  const configs = useAppStore(state => state.urlConfigs);
  const [failed, setFailed] = useState<string>();
  const [loaded, setLoaded] = useState<string>();
  const [applicationIcon, setApplicationIcon] = useState<string>();
  const [websiteIcon, setWebsiteIcon] = useState<{ url: string; source: string }>();
  const info = config.windowInfo;
  useEffect(() => {
    let cancelled = false;
    setApplicationIcon(undefined);
    if (info && config.type === 'window') void windowIcon(info).then(icon => { if (!cancelled) setApplicationIcon(icon); });
    return () => { cancelled = true; };
  }, [config.type, info?.hwnd, info?.exePath, info?.processId, info?.className, info?.icon]);
  useEffect(() => {
    let cancelled = false;
    if (config.type !== 'window' && config.type !== 'scene' && failed) void siteIcon(config.url).then(source => {
      if (source && !cancelled) setWebsiteIcon({ url: config.url, source });
    });
    return () => { cancelled = true; };
  }, [config.type, config.url, failed]);
  let source: string | undefined;
  if (config.type === 'window') {
    source = applicationIcon;
  } else if (config.type !== 'scene') {
    try { source = new URL('/favicon.ico', config.url).href; } catch { /* Invalid saved URLs use the fallback. */ }
    if (websiteIcon?.url === config.url) source = websiteIcon.source;
  }
  if (config.type === 'scene') {
    const members = sceneMembers(config, configs).slice(0, 4);
    return <span className={`target-icon scene-icon ${active ? 'is-active' : ''} ${small ? 'is-small' : ''}`}>
      <span className="scene-icon-grid" data-count={members.length}>{members.map(member => <TargetIcon key={member.id} config={member} />)}{!members.length && <Layers size={20} />}</span>
    </span>;
  }
  return <span className={`target-icon ${active ? 'is-active' : ''} ${small ? 'is-small' : ''}`}>
    {source && source !== failed && <img className={loaded === source ? '' : 'is-loading'} src={source} alt="" loading="lazy" referrerPolicy="no-referrer" onLoad={() => setLoaded(source)} onError={() => setFailed(source)} />}
    {(!source || source === failed || loaded !== source) && <span className="target-initial" aria-hidden="true">{Array.from(config.name.trim())[0]?.toUpperCase() || '?'}</span>}
  </span>;
}
