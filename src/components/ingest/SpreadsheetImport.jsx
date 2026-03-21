import React, { useState, useEffect, useMemo } from 'react';
import { readString } from 'react-papaparse';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import api from '../../services/onyxAI/api';
import SafeIcon from '../../common/SafeIcon';
import DataTypeSelector from './DataTypeSelector';
import * as FiIcons from 'react-icons/fi';

const { FiUpload, FiLoader, FiUsers, FiDatabase, FiFilter, FiAlertCircle, FiChevronUp, FiChevronDown } = FiIcons;

const schemas = {
  Consumer: {
    name: { label: 'Full Name', required: true, suggestions: ['name', 'full_name', 'contact'] },
    email: { label: 'Email Address', required: true, suggestions: ['email', 'email_address'] },
    phone: { label: 'Phone Number', required: false, suggestions: ['phone', 'phone_number'] },
    address: { label: 'Address', required: false, suggestions: ['address', 'street'] },
  },
  Corporate: {
    companyName: { label: 'Company Name', required: true, suggestions: ['company', 'company_name', 'organization'] },
    website: { label: 'Website', required: false, suggestions: ['website', 'url'] },
    industry: { label: 'Industry', required: false, suggestions: ['industry', 'sector'] },
  },
  Voter: {
    fullName: { label: 'Full Name', required: true, suggestions: ['name', 'full_name', 'voter_name'] },
    voterId: { label: 'Voter ID', required: true, suggestions: ['voter_id', 'id'] },
    address: { label: 'Full Address', required: true, suggestions: ['address', 'full_address', 'residence'] },
  },
};

const SpreadsheetImport = () => {
  const [dataType, setDataType] = useState(null);
  const [rawData, setRawData] = useState([]);
  const [processedData, setProcessedData] = useState([]);
  const [fileName, setFileName] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [headers, setHeaders] = useState([]);
  const [columnMap, setColumnMap] = useState({});
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'ascending' });

  useEffect(() => {
    if (dataType) {
      const schema = schemas[dataType];
      const initialMap = Object.keys(schema).reduce((acc, key) => {
        acc[key] = '';
        return acc;
      }, {});
      setColumnMap(initialMap);
      const firstRequiredField = Object.keys(schema).find(key => schema[key].required);
      setSortConfig({ key: firstRequiredField || Object.keys(schema)[0], direction: 'ascending' });
    } else {
      setColumnMap({});
      setSortConfig({ key: null, direction: 'ascending' });
    }
  }, [dataType]);

  useEffect(() => {
    if (rawData.length === 0 || !dataType) {
      setProcessedData([]);
      return;
    }

    const schema = schemas[dataType];
    const requiredFields = Object.keys(schema).filter(key => schema[key].required);
    const isMappingIncomplete = requiredFields.some(key => !columnMap[key]);

    if (isMappingIncomplete) {
      setProcessedData([]);
      return;
    }

    const seenUnique = {}; // For handling uniqueness, e.g., email or voterId

    const cleaned = rawData
      .map(row => {
        const newRow = {};
        for (const key in schema) {
          newRow[key] = row[columnMap[key]]?.trim() || '';
        }
        return newRow;
      })
      .filter(item => {
        // Check for required fields
        for (const key in schema) {
          if (schema[key].required && !item[key]) {
            return false;
          }
        }

        // Specific validations and uniqueness checks
        if (item.email) {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(item.email)) return false;
          if (seenUnique.email?.has(item.email.toLowerCase())) return false;
          if (!seenUnique.email) seenUnique.email = new Set();
          seenUnique.email.add(item.email.toLowerCase());
        }
        if (item.voterId) {
          if (seenUnique.voterId?.has(item.voterId)) return false;
          if (!seenUnique.voterId) seenUnique.voterId = new Set();
          seenUnique.voterId.add(item.voterId);
        }

        return true;
      });

    setProcessedData(cleaned);
  }, [rawData, columnMap, dataType]);

  const sortedData = useMemo(() => {
    let sortableData = [...processedData];
    if (sortConfig.key) {
      sortableData.sort((a, b) => {
        if (a[sortConfig.key] < b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? -1 : 1;
        }
        if (a[sortConfig.key] > b[sortConfig.key]) {
          return sortConfig.direction === 'ascending' ? 1 : -1;
        }
        return 0;
      });
    }
    return sortableData;
  }, [processedData, sortConfig]);

  const handleSort = (key) => {
    let direction = 'ascending';
    if (sortConfig.key === key && sortConfig.direction === 'ascending') {
      direction = 'descending';
    }
    setSortConfig({ key, direction });
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsParsing(true);
    setFileName(file.name);
    setRawData([]);
    setProcessedData([]);
    setHeaders([]);

    // Reset columnMap based on the current dataType's schema
    if (dataType) {
      const schema = schemas[dataType];
      const initialMap = Object.keys(schema).reduce((acc, key) => {
        acc[key] = '';
        return acc;
      }, {});
      setColumnMap(initialMap);
    }

    const reader = new FileReader();

    reader.onload = async (evt) => {
      const fileContent = evt.target.result;

      try {
        let resultsData;
        let fileHeaders;

        if (file.name.endsWith('.csv')) {
          const parseResult = readString(fileContent, {
            header: true,
            skipEmptyLines: true,
          });
          if (parseResult.errors.length > 0) {
            // react-papaparse doesn't throw, so we check errors array
            const firstError = parseResult.errors[0];
            throw new Error(`CSV Parsing Error: ${firstError.message} on row ${firstError.row}.`);
          }
          resultsData = parseResult.data;
          fileHeaders = parseResult.meta.fields;
        } else if (file.name.endsWith('.json')) {
          resultsData = JSON.parse(fileContent);
          if (!Array.isArray(resultsData) || resultsData.length === 0) {
            throw new Error('JSON must be a non-empty array of objects.');
          }
          fileHeaders = Object.keys(resultsData[0]);
        } else {
          throw new Error('Unsupported file type.');
        }

        setHeaders(fileHeaders);
        setRawData(resultsData);

        // Auto-map columns based on schema
        const schema = schemas[dataType];
        const newColumnMap = { ...columnMap };
        const lowerCaseHeaders = fileHeaders.map(h => h.toLowerCase());

        for (const key in schema) {
          for (const suggestion of schema[key].suggestions) {
            const foundIndex = lowerCaseHeaders.findIndex(h => h.includes(suggestion));
            if (foundIndex !== -1) {
              newColumnMap[key] = fileHeaders[foundIndex];
              break; // Move to next schema key once a match is found
            }
          }
        }
        setColumnMap(newColumnMap);

      } catch (err) {
        toast.error(`Error processing file: ${err.message}`);
        setFileName('');
      } finally {
        setIsParsing(false);
      }
    };

    reader.onerror = () => {
        toast.error('Failed to read file.');
        setIsParsing(false);
    };

    if (file.name.endsWith('.csv') || file.name.endsWith('.json')) {
      reader.readAsText(file);
    } else {
      toast.error('Unsupported file type. Please upload a CSV or JSON file.');
      setIsParsing(false);
      setFileName('');
    }
  };

  const handleImport = async () => {
    if (processedData.length === 0) {
      toast.error('No valid records to import. Check mapping and data quality.');
      return;
    }

    setIsImporting(true);
    toast.loading(`Importing ${dataType} data...`);

    const recordsToImport = {
      dataType: dataType,
      source: `spreadsheet_import:${fileName}`,
      records: processedData,
    };

    try {
      // Assuming a more generic API endpoint is available
      await api.bulkImport(recordsToImport);
      toast.dismiss();
      toast.success(`${processedData.length} records imported successfully!`);

      // Reset state to start over
      setRawData([]);
      setProcessedData([]);
      setFileName('');
      setHeaders([]);
      setDataType(null); // Go back to the data type selector. This will trigger the useEffect to reset columnMap.

    } catch (error) {
      toast.dismiss();
      toast.error(`Import failed: ${error.message}`);
    } finally {
      setIsImporting(false);
    }
  };

  const renderFileDropzone = () => (
    <div className="border-2 border-dashed border-onyx-accent/20 rounded-xl p-8 text-center relative cursor-pointer hover:border-blue-500 transition-colors">
      <input
        type="file"
        accept=".csv,.json"
        onChange={handleFileUpload}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        disabled={isParsing}
        data-testid="csv-input"
      />
      <div className="flex flex-col items-center justify-center">
        <SafeIcon icon={FiUpload} className="w-12 h-12 text-slate-400 mb-4" />
        <p className="text-white font-semibold">
          {fileName ? `Selected: ${fileName}` : 'Click or drag to upload CSV or JSON file'}
        </p>
        <p className="text-slate-400 text-sm mt-1">
          You will be able to map columns after uploading.
        </p>
      </div>
    </div>
  );

  const renderColumnMapping = () => {
    if (!dataType) return null;
    const schema = schemas[dataType];

    return (
      <div className="mt-6 p-6 glass-effect rounded-lg">
        <h3 className="text-xl font-semibold text-white mb-4">3. Map Columns</h3>
        <p className="text-slate-400 mb-4 text-sm">Match your spreadsheet columns to the required fields for <span className="font-semibold text-blue-400">{dataType}</span> data.</p>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Object.keys(schema).map(key => (
            <div key={key}>
              <label htmlFor={`${key}-column`} className="block text-sm font-medium text-slate-300 mb-2">
                {schema[key].label} {schema[key].required && <span className="text-red-400">*</span>}
              </label>
              <select
                id={`${key}-column`}
                value={columnMap[key] || ''}
                onChange={(e) => setColumnMap(prev => ({ ...prev, [key]: e.target.value }))}
                className="w-full pl-3 pr-10 py-2 bg-onyx-950/50 border border-onyx-accent/20 rounded-lg text-white"
              >
                <option value="">Select Column...</option>
                {headers.map(h => <option key={`${key}-${h}`} value={h}>{h}</option>)}
              </select>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const renderDataPreview = () => {
    if (!dataType) return null;
    const schema = schemas[dataType];
    const schemaKeys = Object.keys(schema);
    const requiredFields = Object.keys(schema).filter(key => schema[key].required);
    const isMappingIncomplete = requiredFields.some(key => !columnMap[key]);

    return (
      <div className="mt-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-xl font-semibold text-white">4. Preview & Validate</h3>
          <div className="flex items-center space-x-4">
            <div className="flex items-center text-slate-300">
              <SafeIcon icon={FiFilter} className="mr-2 text-blue-400"/>
              {`${processedData.length} / ${rawData.length} valid records`}
            </div>
          </div>
        </div>
        <div className="overflow-x-auto glass-effect rounded-lg">
          <table className="w-full text-sm text-left text-slate-300">
            <thead className="text-xs text-slate-400 uppercase bg-onyx-950/50">
              <tr>
                {schemaKeys.map(key => (
                  <th key={key} className="px-6 py-3 cursor-pointer hover:bg-onyx-accent/20" onClick={() => handleSort(key)}>
                    <div className="flex items-center">
                      {schema[key].label}
                      {sortConfig.key === key && (
                        <SafeIcon icon={sortConfig.direction === 'ascending' ? FiChevronUp : FiChevronDown} className="ml-2" />
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedData.slice(0, 5).map((row, i) => (
                <tr key={i} className="border-b border-onyx-accent/20">
                  {schemaKeys.map(key => (
                    <td key={key} className="px-6 py-4">{row[key]}</td>
                  ))}
                </tr>
              ))}
              {processedData.length === 0 && rawData.length > 0 && (
                <tr>
                  <td colSpan={schemaKeys.length} className="text-center p-6">
                    <div className="flex flex-col items-center">
                      <SafeIcon icon={FiAlertCircle} className="w-8 h-8 text-yellow-400 mb-2" />
                      <p className="font-semibold">No valid data to display.</p>
                      <p className="text-slate-400">
                        {isMappingIncomplete
                          ? "Please map all required fields (*) to continue."
                          : "No rows in your file match the required format."}
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="glass-effect rounded-xl p-6 mt-8">
      <div className="flex items-center justify-between space-x-3 mb-6">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gradient-to-r from-green-500 to-teal-600 rounded-lg flex items-center justify-center">
            <SafeIcon icon={FiUsers} className="text-white" />
          </div>
          <h2 className="text-lg font-semibold text-white">Import Spreadsheet</h2>
        </div>
        {dataType && (
          <button
            onClick={() => {
              setDataType(null);
              setRawData([]);
              setFileName('');
            }}
            className="text-sm text-blue-400 hover:text-blue-300"
          >
            Change Data Type
          </button>
        )}
      </div>

      {!dataType ? (
        <DataTypeSelector onSelect={setDataType} selectedType={dataType} />
      ) : (
        <>
          {renderFileDropzone()}

          {isParsing && (
            <div className="flex items-center justify-center text-white mt-4">
              <SafeIcon icon={FiLoader} className="animate-spin mr-2" />
              <span>Parsing file...</span>
            </div>
          )}

          {rawData.length > 0 && !isParsing && (
            <>
              {renderColumnMapping()}
              {renderDataPreview()}
              <div className="mt-6 flex justify-end">
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={handleImport}
                  disabled={isImporting || processedData.length === 0}
                  className="flex items-center justify-center px-6 py-3 bg-gradient-to-r from-blue-500 to-purple-600 text-white font-semibold rounded-lg shadow-lg disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isImporting ? (
                    <><SafeIcon icon={FiLoader} className="animate-spin mr-2" /><span>Importing...</span></>
                  ) : (
                    <><SafeIcon icon={FiDatabase} className="mr-2" /><span>Import {processedData.length} Records</span></>
                  )}
                </motion.button>
              </div>
            </>
          )}
        </>
      )}
    </motion.div>
  );
};

export default SpreadsheetImport;