// Record our actual WebGL canvases immediately after their draw calls.
// The captured trial always uses the free local advisor.
export async function recordDemo(engine,result,onProgress){
  const canvas=document.createElement('canvas');canvas.width=1600;canvas.height=900;
  const c=canvas.getContext('2d');
  const mime=['video/webm;codecs=vp9','video/webm;codecs=vp8','video/webm'].find(v=>MediaRecorder.isTypeSupported(v));
  if(!mime)throw Error('This browser cannot record WebM video.');
  const stream=canvas.captureStream(30),recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:6500000}),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const done=new Promise(resolve=>recorder.onstop=()=>{
    engine.onRender=null;stream.getTracks().forEach(t=>t.stop());
    const url=URL.createObjectURL(new Blob(chunks,{type:mime})),a=document.createElement('a');a.href=url;a.download='fly-assist-demo.webm';a.click();setTimeout(()=>URL.revokeObjectURL(url),1500);onProgress('Demo saved');resolve();
  });
  let start=performance.now(),phase=0,finishedAt=null;
  engine.stimulate('sugar');
  const text=(str,x,y,size,color='#f6edda',weight=400)=>{c.fillStyle=color;c.font=`${weight} ${size}px Arial`;c.fillText(str,x,y);};
  engine.onRender=()=>{
    const sec=(performance.now()-start)/1000;
    if(sec>=6&&phase===0){phase=1;engine.stimulate('loom');}
    if(sec>=12&&phase===1){phase=2;engine.playTrial(result);}
    if(phase===2&&engine.completed&&finishedAt===null)finishedAt=sec;
    const ending=finishedAt!==null&&sec>finishedAt+2;
    c.fillStyle='#101615';c.fillRect(0,0,1600,900);
    c.fillStyle='#df4635';c.fillRect(0,0,1600,7);
    text('FLY / ASSIST',56,65,23,'#e77560',700);
    text('A FLY WITH AN ASK BUTTON',56,132,52,'#f6edda',700);
    text('138,639 neurons  /  FlyWire v783  /  a learned output layer',58,176,23,'#97aaa5');
    if(!ending){
      c.drawImage(engine.flyCanvas,40,215,950,520);c.drawImage(engine.brainCanvas,1010,215,550,520);
      text(phase===0?'SUGAR → FEEDING':phase===1?'SHADOW → ESCAPE':'TWO DISHES. ONE HAS FOOD.',62,252,20,'#e77560',700);
      text('SIMULATED NEURAL ACTIVITY',1034,252,18,'#97aaa5');
      c.fillStyle='#101615';c.fillRect(0,742,1600,158);
      let caption=phase===0?'Sensory input becomes neural activity.':phase===1?'Change the stimulus. Watch the response.':!engine.trialReady?'A hidden food location. No direction cue.':engine.elapsed<3.2?'The learned readout chooses: ASK.':engine.completed?'The advisor’s hint becomes a direction. Food reached.':'A local advisor returns “right”. The body follows.';
      text(caption,58,799,35,'#f6edda',700);
      text(phase<2?'Live connectome simulation + an engineered body':'Local advisor demo  ·  seed 100046  ·  neural replay at 10× slower speed',60,854,21,'#97aaa5');
    }else{
      text('256 / 256',60,350,96,'#f6edda',700);text('food locations found',65,400,28,'#97aaa5');
      text('122 hints',875,350,90,'#e77560',700);text('instead of 256',880,400,28,'#97aaa5');
      text('52% fewer hints in the local-advisor test.',64,536,46,'#f6edda',700);
      text('Try it free. Connect your own Grok key for live hints.',64,666,34,'#f6edda');
      text('knapabuse2-cmd.github.io/fly-assist',64,741,31,'#e77560',700);
      text('Built on Fly Brain Bench by Raphael Rocha · FlyWire data CC BY 4.0',64,839,20,'#97aaa5');
    }
    onProgress(`Recording demo · ${Math.floor(sec)}s`);
    if((finishedAt!==null&&sec>finishedAt+9)||sec>55){engine.onRender=null;recorder.stop();}
  };
  recorder.start(1000);return done;
}
