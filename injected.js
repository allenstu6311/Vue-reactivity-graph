const app = document.querySelector("#app")?.__vue_app__?._instance;

if (app) {
  function trackSetupState(rawSetupState) {
    // console.log('rawSetupState', rawSetupState)
    for (const key in rawSetupState) {
      const val = rawSetupState[key];

      val.__tracker_name = key;
      // console.log('key', key)
      // console.log('val', val)
      // console.log('----------------')
      if (val._rawValue && typeof val._rawValue === "object") {
        val._rawValue.__tracker_name = key;
      }
    }

    for (const key in rawSetupState) {
      const val = rawSetupState[key];

      // 是 computed
      if (val?.fn) {
        val.onTrack = (event) => {
          // subscriber 的名稱：用 closure 捕捉的 key
          const subscriberName = key;
          // dependency 的名稱：從之前標記的 __tracker_name 拿
          const depName = event.target.__tracker_name;
          if (depName) {
            console.log(
              `[Vue Reactivity Tracker] ${subscriberName} 追蹤了 ${depName}`,
            );
          }else if(event.target.$id){
            // pinia store 的 state 沒有 __tracker_name，但有 $id 可以辨識是哪個 store
            console.log(
              `[Vue Reactivity Tracker] ${subscriberName} 追蹤了 ${event.key}`,
            );
          }
        };

        //  強制觸發computed重新計算，來測試追蹤功能是否正常
        val.flags |= 1 << 4; // 設 DIRTY
        val.flags &= ~(1 << 7); // 清除 EVALUATED
        val.globalVersion = -1; // 繞過 globalVersion fast path
        val.value;
      }
    }
  }

  function traverse(instance) {
    console.log("--- instance name ----", instance.type.__name);
    // 對這個 instance 的 setupState 跑追蹤邏輯
    const rawSetupState = instance.setupState?.["__v_raw"];
    if (rawSetupState) {
      trackSetupState(rawSetupState);
    }

    const watchEffects = instance.scope?.effects.filter(
      (e) => e !== instance.effect, // 過濾掉 component effect，因為它不是 watch 的 effect,
    );

    if (watchEffects && watchEffects.length > 0) {
      watchEffects.forEach((effect, i) => {
        effect.__depList = new Map(); // 用來記錄這個 watch 追蹤了哪些 dependency
        effect.onTrack = (event) => {
          const depName = event.target.__tracker_name;

          if(depName){
            effect.__depList.set(depName, depName);
          }else if(event.target.$id){
            effect.__depList.set(event.key, event.key);
          }

          const depListStr = Array.from(effect.__depList.keys()).join(', ');  
          console.log(`[Vue Reactivity Tracker] watch(${depListStr})`);
          
        };
        effect.run(); // 強制觸發一次 watch 來測試追蹤功能是否正常

        // console.log('effect.fn.toString()', effect.fn.toString())

      });
    }

    // 繼續往下找子組件
    walkVNode(instance.subTree);
  }

  function walkVNode(vnode) {
    if (!vnode) return;
    if (vnode.component) {
      traverse(vnode.component); // 遞迴
    }
    if (Array.isArray(vnode.children)) {
      vnode.children.forEach((child) => {
        if (child && typeof child === "object") walkVNode(child);
      });
    }
  }

  traverse(app);
}
