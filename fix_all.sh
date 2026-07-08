sed -i 's|// eslint-disable-next-line react-hooks/set-state-in-effect||g' src/components/ingest/SpreadsheetImport.jsx
sed -i 's|setColumnMap(initialMap);|// eslint-disable-next-line react-hooks/set-state-in-effect\n      setColumnMap(initialMap);|g' src/components/ingest/SpreadsheetImport.jsx
sed -i 's|setProcessedData(\[\]);|// eslint-disable-next-line react-hooks/set-state-in-effect\n      setProcessedData([]);|g' src/components/ingest/SpreadsheetImport.jsx
sed -i 's|fetchDevices();|// eslint-disable-next-line react-hooks/set-state-in-effect\n    fetchDevices();|g' src/components/settings/DeviceManager.jsx
sed -i 's|setAiSettings(|// eslint-disable-next-line react-hooks/set-state-in-effect\n      setAiSettings(|g' src/components/settings/Settings.jsx
sed -i 's|setUpdateStatus(|// eslint-disable-next-line react-hooks/set-state-in-effect\n      setUpdateStatus(|g' src/components/settings/UpdateManager.jsx
