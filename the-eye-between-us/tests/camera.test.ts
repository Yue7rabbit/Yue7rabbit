import { afterEach, expect, test, vi } from 'vitest';
import { Camera } from '../src/tracking/camera';
afterEach(()=>vi.unstubAllGlobals());
function setup(getUserMedia: ReturnType<typeof vi.fn>, play=vi.fn().mockResolvedValue(undefined)) {
 const video={playsInline:false,muted:false,setAttribute:vi.fn(),style:{cssText:''},srcObject:null,play,readyState:2,videoWidth:640};
 vi.stubGlobal('document',{createElement:()=>video,body:{appendChild:vi.fn()}});
 vi.stubGlobal('navigator',{mediaDevices:{getUserMedia}});
 return {camera:new Camera(),video};
}
function stream(){const stop=vi.fn();return {media:{getTracks:()=>[{stop}],getVideoTracks:()=>[{stop,addEventListener:vi.fn()}]},stop};}
test('camera denial yields a usable error status',async()=>{const {camera}=setup(vi.fn().mockRejectedValue({name:'NotAllowedError'}));expect(await camera.start()).toBe(false);expect(camera.status).toBe('denied');});
test('stopping releases tracks and disconnects the video',async()=>{const s=stream();const {camera,video}=setup(vi.fn().mockResolvedValue(s.media));expect(await camera.start()).toBe(true);camera.stop();expect(s.stop).toHaveBeenCalledOnce();expect(video.srcObject).toBe(null);expect(camera.ready).toBe(false);});
test('a late permission response cannot reactivate a cancelled camera',async()=>{const s=stream();let resolve!:(v:unknown)=>void;const {camera,video}=setup(vi.fn(()=>new Promise(r=>resolve=r)));const pending=camera.start();camera.stop();resolve(s.media);expect(await pending).toBe(false);expect(s.stop).toHaveBeenCalledOnce();expect(camera.status).toBe('off');expect(video.srcObject).toBe(null);});
test('video playback failure releases camera capture',async()=>{const s=stream();const {camera}=setup(vi.fn().mockResolvedValue(s.media),vi.fn().mockRejectedValue(new Error('playback failed')));expect(await camera.start()).toBe(false);expect(s.stop).toHaveBeenCalledOnce();expect(camera.ready).toBe(false);});
