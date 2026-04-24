// 邊界條件測試
// 測試 inject 無對應 provider 時使用預設值（inject node 建立但 deps 為空）
// 測試 provide computed ref（inject node 的 deps 應指向 computed node）
// 測試鏈式 re-provide（A provide → B inject 後再 provide → C inject，injectRawToNodeMap 不被覆蓋）
// 驗收標準待補
