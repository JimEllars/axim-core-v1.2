import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import SpreadsheetImport from './SpreadsheetImport';
import { readString } from 'react-papaparse';
import api from '../../services/onyxAI/api';

// Mock dependencies
vi.mock('react-papaparse', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    readString: vi.fn(),
  };
});

vi.mock('../../services/onyxAI/api', () => ({
  default: {
    bulkImport: vi.fn(),
  },
}));

vi.mock('react-hot-toast', () => ({
  default: {
    success: vi.fn(),
    error: vi.fn(),
    loading: vi.fn(),
    dismiss: vi.fn(),
  },
}));

// Mock data for different schemas
const mockConsumerCsv = `name,email,phone\nAlice,alice@example.com,123\nBob,bob@example.com,\n,no-name@test.com\nDuplicate,duplicate@example.com\nDuplicate,duplicate@example.com`;
const mockParsedConsumerCsv = {
  data: [
    { name: 'Alice', email: 'alice@example.com', phone: '123' },
    { name: 'Bob', email: 'bob@example.com', phone: '' },
    { name: '', email: 'no-name@test.com', phone: '' },
    { name: 'Duplicate', email: 'duplicate@example.com', phone: '' },
    { name: 'Duplicate', email: 'duplicate@example.com', phone: '' },
  ],
  meta: { fields: ['name', 'email', 'phone'] },
};

const mockCorporateCsv = `company_name,website\nTechCorp,tech.com\nInnovate Inc,innovate.com`;
const mockParsedCorporateCsv = {
  data: [
    { company_name: 'TechCorp', website: 'tech.com' },
    { company_name: 'Innovate Inc', website: 'innovate.com' },
  ],
  meta: { fields: ['company_name', 'website'] },
};

describe('SpreadsheetImport', () => {
    let mockFileReader;

    beforeEach(() => {
        vi.clearAllMocks();
        api.bulkImport.mockResolvedValue({});

        readString.mockImplementation((_content, _config) => ({
          ...mockParsedConsumerCsv,
          errors: [],
        }));

        mockFileReader = {
            readAsText: vi.fn().mockImplementation(function() {
              Promise.resolve().then(() => {
                if (typeof this.onload === 'function') {
                  this.onload({ target: { result: this.fileContent } });
                }
              });
            }),
            onload: null,
            onerror: null,
            fileContent: ''
        };
        vi.stubGlobal('FileReader', vi.fn(() => mockFileReader));
    });

    const renderComponent = () => {
        render(<SpreadsheetImport />);
    };

    const uploadFile = async (file, content, parsedData) => {
        readString.mockImplementation((_content, _config) => ({
          ...parsedData,
          errors: [],
        }));
        const fileInput = screen.getByTestId('csv-input');
        mockFileReader.fileContent = content;
        await act(async () => {
          fireEvent.change(fileInput, { target: { files: [file] } });
        });
    };

    it('renders the data type selector initially', () => {
        renderComponent();
        expect(screen.getByText('1. Select Data Type')).toBeInTheDocument();
        expect(screen.getByText('Consumer')).toBeInTheDocument();
        expect(screen.queryByText(/Click or drag to upload/)).not.toBeInTheDocument();
    });

    it('shows file dropzone after selecting a data type', async () => {
        renderComponent();
        fireEvent.click(screen.getByText('Consumer'));
        await waitFor(() => {
          expect(screen.getByText(/Click or drag to upload/)).toBeInTheDocument();
        });
        expect(screen.getByText('Change Data Type')).toBeInTheDocument();
    });

    describe('when importing Consumer data', () => {
        beforeEach(async () => {
            renderComponent();
            fireEvent.click(screen.getByText('Consumer'));
            await waitFor(() => {
              expect(screen.getByText(/Click or drag to upload/)).toBeInTheDocument();
            });
        });

        it('handles file upload, mapping, and validation', async () => {
            const file = new File([mockConsumerCsv], 'consumers.csv', { type: 'text/csv' });
            await uploadFile(file, mockConsumerCsv, mockParsedConsumerCsv);

            expect(await screen.findByText('3. Map Columns')).toBeInTheDocument();
            expect(await screen.findByLabelText(/Full Name/)).toHaveValue('name');
            expect(await screen.findByLabelText(/Email Address/)).toHaveValue('email');
            expect(await screen.findByText(/3 \/ 5 valid records/)).toBeInTheDocument();
            expect(screen.getByText('Alice')).toBeInTheDocument();
        });

        it('calls the import API with correct payload', async () => {
            const file = new File([mockConsumerCsv], 'consumers.csv', { type: 'text/csv' });
            await uploadFile(file, mockConsumerCsv, mockParsedConsumerCsv);

            const importButton = await screen.findByRole('button', { name: /Import 3 Records/i });
            fireEvent.click(importButton);

            await waitFor(() => {
                expect(api.bulkImport).toHaveBeenCalledTimes(1);
                expect(api.bulkImport).toHaveBeenCalledWith({
                    dataType: 'Consumer',
                    source: 'spreadsheet_import:consumers.csv',
                    records: [
                        { name: 'Alice', email: 'alice@example.com', phone: '123', address: '' },
                        { name: 'Bob', email: 'bob@example.com', phone: '', address: '' },
                        { name: 'Duplicate', email: 'duplicate@example.com', phone: '', address: '' }
                    ],
                });
            });

            await waitFor(() => {
              expect(screen.getByText('1. Select Data Type')).toBeInTheDocument();
            });
        });
    });

    describe('when importing Corporate data', () => {
        beforeEach(async () => {
            renderComponent();
            fireEvent.click(screen.getByText('Corporate'));
            await waitFor(() => {
              expect(screen.getByText(/Click or drag to upload/)).toBeInTheDocument();
            });
        });

        it('maps and validates corporate fields', async () => {
            const file = new File([mockCorporateCsv], 'companies.csv', { type: 'text/csv' });
            await uploadFile(file, mockCorporateCsv, mockParsedCorporateCsv);

            expect(await screen.findByLabelText(/Company Name/)).toHaveValue('company_name');
            expect(await screen.findByLabelText(/Website/)).toHaveValue('website');
            expect(await screen.findByText(/2 \/ 2 valid records/)).toBeInTheDocument();
        });
    });

    it('allows changing the data type', async () => {
        renderComponent();
        fireEvent.click(screen.getByText('Consumer'));
        await waitFor(() => {
          expect(screen.getByText(/Click or drag to upload/)).toBeInTheDocument();
        });

        fireEvent.click(screen.getByText('Change Data Type'));

        await waitFor(() => {
            expect(screen.getByText('1. Select Data Type')).toBeInTheDocument();
        });
    });
});