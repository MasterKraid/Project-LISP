// Fix: Create types.ts to define all data structures used in the application.
// This resolves numerous 'is not a module' and type definition errors across the project.
export interface User {
    id: number;
    username: string;
    alias?: string;
    branchId: number;
    role: 'ADMIN' | 'GENERAL_EMPLOYEE' | 'CLIENT' | 'DATA_ENTRY';
    wallet_balance: number;
    allow_negative_balance: boolean;
    negative_balance_allowed_until?: string;
    assigned_list_ids?: number[];
    master_data_entry?: boolean;
}

export interface Branch {
    id: number;
    name: string;
    address: string;
    phone: string;
}

export interface PackageList {
    id: number;
    name: string;
    package_count?: number;
    is_mother_ratelist?: boolean;
    missing_master_count?: number;
    missing_master_packages?: string[];
    has_red_outline?: boolean;
    has_yellow_outline?: boolean;
    unconfigured_pricing_count?: number;
}

export interface MasterPackage {
    id: number;
    name: string;
    code_name?: string;
    alias_count?: number;
    aliases?: string;
}

export interface AdminSettings {
    upi_id: string;
    organization_name?: string;
    org_name?: string;
    lab_name?: string;
}

export interface Package {
    id: number;
    name: string;
    mrp: number;
    b2b_price: number;
    package_list_id: number;
    code_name?: string;
}

export interface Lab {
    id: number;
    name: string;
    logo_path?: string;
    assigned_list_ids?: number[];
}

export interface Customer {
    id: number;
    prefix?: string;
    name: string;
    mobile?: string;
    email?: string;
    dob?: string;
    age?: number; // legacy
    age_years?: number;
    age_months?: number;
    age_days?: number;
    gender?: 'Male' | 'Female';
    created_at: string;
    updated_at: string;
    created_by_user_id: number;
}

export interface TransactionItem {
    name: string;
    mrp: number;
    b2b_price: number;
}

export interface Transaction {
    id: number;
    user_id: number;
    date: string;
    type: 'RECEIPT_DEDUCTION' | 'ADMIN_CREDIT' | 'ADMIN_DEBIT' | 'SETTLEMENT';
    amount_deducted: number;
    balance_snapshot?: number;
    notes?: string;
    receipt_id?: number;
    items?: TransactionItem[];
    customer_name?: string;
    total_profit?: number;
}

export interface Receipt {
    id: number;
    customer_id: number;
    branch_id: number;
    created_at: string;
    total_mrp: number;
    amount_final: number;
    amount_received: number;
    amount_due: number;
    payment_method: string;
    referred_by?: string;
    notes?: string;
    num_tests: number;
    logo_path?: string;
    created_by_user_id: number;
    acting_as_client_id?: number;
    data_entry_done?: number;
    lab_id?: number;
    lab_name?: string;
    package_list_id?: number;
    acting_as_client?: User;
}

export interface Estimate {
    id: number;
    customer_id: number;
    branch_id: number;
    created_at: string;
    amount_after_discount: number;
    referred_by?: string;
    notes?: string;
    created_by_user_id: number;
}

export interface DocumentItem {
    id: number;
    package_name: string;
    mrp: number;
    discount_percentage: number;
}

export interface FormattedCustomer extends Customer {
    display_id: string;
    dob_formatted: string;
    display_age: string;
    display_created_at: string;
}

export interface Document {
    id: number;
    display_doc_id: string;
    display_date: string;
    customer_name: string;
    display_customer_id: string;
    customer_id?: number;
    display_amount: string;
    created_by_user: string;
    acting_as_client_id?: number;
    created_by_user_id?: number;
    total_mrp?: number;
    amount_final?: number;
    b2b_cost?: number;
    payment_method?: string;
    referred_by?: string;
    num_tests?: number;
    data_entry_done?: number;
    lab_name?: string;
    mother_b2b_cost?: number;
    test_names?: string;
    items?: any[];
}

export interface LabReport {
    id: number;
    client_id: number;
    customer_name: string;
    file_path: string;
    uploaded_at: string;
    is_read: boolean;
    alias?: string;
    username?: string;
    customer_id?: number;
    category?: 'With Header' | 'Without Header' | 'Bill' | 'Others';
}

export interface ComparisonTest {
    id: number;
    name: string;
}

export interface ComparisonLab {
    id: number;
    name: string;
}

export interface ComparisonPrice {
    test_id: number;
    lab_id: number;
    price: number;
}