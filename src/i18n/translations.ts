// Central Translations Dict for LEDGRA / لِدجرا
export type Locale = 'ar' | 'en';

export const translations = {
  ar: {
    brand: {
      name: 'LEDGRA',
      name_native: 'لِدجرا',
      tagline: 'نظام إدارة الأعمال والمحاسبة السحابية',
      description: 'منصة محاسبية مخصصة للمنشآت السعودية، مهيأة لاحقًا للامتثال والربط مع متطلبات الفوترة الإلكترونية والضريبة.'
    },
    common: {
      save: 'حفظ',
      cancel: 'إلغاء',
      next: 'التالي',
      prev: 'السابق',
      finish: 'إنهاء الإعداد',
      or: 'أو',
      loading: 'جاري التحميل...',
      search: 'بحث عام في النظام...',
      notifications: 'الإشعارات',
      help: 'المساعدة والدعم',
      profile: 'الملف الشخصي',
      logout: 'تسجيل الخروج',
      sar: 'ر.س',
      saudi_arabia: 'المملكة العربية السعودية',
      setup_supabase: 'خطوات ربط Supabase',
      required: 'حقل مطلوب',
      email_invalid: 'البريد الإلكتروني غير صالح',
      phone_invalid: 'رقم الجوال يجب أن يبدأ بـ 05 ويتكون من 10 أرقام',
      vat_invalid: 'الرقم الضريبي يجب أن يكون 15 خانة ويبدأ وينتهي بـ 3',
      success: 'تمت العملية بنجاح',
      success_onboarding: 'تم تهيئة المنشأة بنجاح ومرحباً بك في لِدجرا!'
    },
    auth: {
      login_title: 'تسجيل الدخول إلى حسابك',
      login_subtitle: 'أدخل تفاصيل حسابك للوصول إلى لوحة محاسبة لِدجرا',
      register_title: 'بدء تجربة مجانية جديدة',
      register_subtitle: 'أنشئ حسابك الآن وتحكم بمالية منشأتك بذكاء',
      email: 'البريد الإلكتروني',
      password: 'كلمة المرور',
      confirm_password: 'تأكيد كلمة المرور',
      full_name: 'الاسم الكامل',
      phone: 'رقم الجوال',
      forgot_password: 'نسيت كلمة المرور؟',
      sign_in: 'تسجيل الدخول',
      sign_up: 'إنشاء الحساب',
      have_account: 'لديك حساب بالفعل؟',
      no_account: 'ليس لديك حساب؟',
      terms_agree: 'أوافق على اتفاقية الاستخدام وسياسة الخصوصية لـ لِدجرا',
      auth_error: 'خطأ في المصادقة، يرجى التحقق من البيانات المدخلة'
    },
    onboarding: {
      steps: {
        company_info: 'معلومات المنشأة',
        legal_vat: 'المعلومات القانونية والضريبية',
        accounting_setup: 'الإعداد المحاسبي الأولي'
      },
      title: 'تهيئة منشأتك لأول مرة',
      subtitle: 'خطوات بسيطة وسريعة لتهيئة النظام المحاسبي المتكامل لعملك',
      company_name_ar: 'اسم المنشأة باللغة العربية',
      company_name_en: 'اسم المنشأة باللغة الإنجليزية (اختياري)',
      activity_type: 'نوع النشاط التجاري',
      country: 'الدولة',
      city: 'المدينة',
      legal_type: 'الكيان القانوني',
      legal_type_options: {
        individual: 'مؤسسة فردية',
        llc: 'شركة ذات مسؤولية محدودة',
        joint: 'شركة مساهمة',
        branch: 'فرع شركة أجنبية'
      },
      cr_number: 'رقم السجل التجاري / الرقم الموحد',
      vat_number: 'الرقم الضريبي (15 رقم ويبدأ بـ 3)',
      is_vat_registered: 'المنشأة مسجلة في ضريبة القيمة المضافة ومستعدة لإصدار فواتير ضريبية',
      fiscal_year_start: 'تاريخ بداية السنة المالية المعتمد',
      currency: 'العملة الأساسية',
      language: 'اللغة الأساسية للنظام',
      accounting_mode: 'النظام المحاسبي المطلوب',
      acc_mode_simple: 'مبسط (مثالي للمتاجر والخدمات البسيطة - فواتير وربح مباشر)',
      acc_mode_pro: 'احترافي (شجرة حسابات كاملة، قيود يومية، ميزانية عمومية ومطابقات)',
      use_system_start: 'تاريخ بداية استخدام النظام',
      starting_balances_later: 'إضافة الأرصدة الافتتاحية للمرة الأولى لاحقًا عند تعديل الحسابات'
    },
    sidebar: {
      home: 'لوحة التحكم الرئيسي',
      sales: 'المبيعات والعملاء',
      purchases: 'المشتريات والموردين',
      expenses: 'دليل المصروفات',
      items: 'المنتجات والخدمات',
      customers: 'قائمة العملاء',
      vendors: 'قائمة الموردين',
      accounting: 'المحاسبة والقيود',
      reports: 'التقارير المالية والتحليل',
      settings: 'إعدادات النظام',
      soon: 'قريباً',
      active_org: 'المنشأة الحالية'
    },
    dashboard: {
      welcome: 'مرحباً بك مجدداً في لِدجرا 👋',
      tag: 'إليك نظرة سريعة على الأداء المالي لمنشأتك اليوم.',
      kpis: {
        sales: 'إجمالي المبيعات',
        expenses: 'إجمالي المصروفات',
        profit: 'صافي الأرباح',
        receivables: 'المبالغ المستحقة'
      },
      charts: {
        title: 'الإيرادات والمصروفات',
        distribution: 'توزيع المصروفات (أبواب الصرف)',
        revenue: 'الإيرادات',
        expenses: 'المصروفات'
      },
      invoices: {
        title: 'آخر الفواتير الصادرة والواردة',
        num: 'رقم الفاتورة',
        customer: 'العميل / المورد',
        amount: 'الملغ الإجمالي',
        status: 'الحالة',
        date: 'التاريخ',
        status_paid: 'مدفوعة',
        status_unpaid: 'غير مدفوعة',
        status_partial: 'مدفوعة جزئياً'
      },
      actions: {
        title: 'الإجراءات السريعة والمباشرة',
        invoice: 'إنشاء فاتورة جديدة',
        customer: 'إضافة عميل جديد',
        expense: 'تسجيل مصروف جديد',
        product: 'إضافة منتج/خدمة'
      },
      alerts: {
        title: 'التنبيهات والمهام المجدولة',
        task_vat: 'فاتورة مستحقة السداد خلال 7 أيام القادمة',
        task_cr: 'تثبيت مستندات متأخرة الدفع وإعلاق الفترات',
        task_inventory: 'هناك 3 منتجات وصلت للحد الأدنى من المخزون'
      },
      empty_state_title: 'لا توجد حركات مالية مسجلة بعد',
      empty_state_desc: 'ابدأ بالعمل الآن! اختر أحد الإجراءات السريعة لإنشاء أول فاتورة أو إضافة بيانات منشأتك.'
    },
    settings: {
      title: 'إعدادات المنشأة والنظام',
      subtitle: 'إدارة تفاصيل الهوية الضريبية، الفروع، والمستخدمين ذوي الصلاحيات',
      tab_info: 'بيانات المنشأة والضريبة',
      tab_users: 'المستخدمون والصلاحيات',
      tab_branches: 'الفروع ونقاط البيع',
      vat_status: 'الحالة الضريبية للمنشأة',
      user_name: 'الاسم الكامل',
      user_email: 'البريد الإلكتروني',
      user_role: 'الدور / الصلاحية',
      branch_name: 'اسم الفرع',
      branch_code: 'رمز الفرع',
      branch_address: 'العنوان الجغرافي',
      is_main_branch: 'هل هذا هو الفرع الرئيسي؟',
      add_branch: 'إضافة فرع جديد',
      add_user: 'دعوة مستخدم جديد'
    }
  },
  en: {
    brand: {
      name: 'LEDGRA',
      name_native: 'Ledgraar',
      tagline: 'Cloud Accounting & Business Management Platform',
      description: 'An enterprise cloud accounting system optimized for Saudi businesses.'
    },
    common: {
      save: 'Save',
      cancel: 'Cancel',
      next: 'Next',
      prev: 'Previous',
      finish: 'Finish Setup',
      or: 'or',
      loading: 'Loading...',
      search: 'Universal search...',
      notifications: 'Notifications',
      help: 'Help & Support',
      profile: 'User Profile',
      logout: 'Log Out',
      sar: 'SAR',
      saudi_arabia: 'Saudi Arabia',
      setup_supabase: 'Connect Supabase',
      required: 'Required field',
      email_invalid: 'Invalid email address',
      phone_invalid: 'Phone must start with 05 and be 10 digits',
      vat_invalid: 'VAT must be 15 digits starting and ending with 3',
      success: 'Action completed successfully',
      success_onboarding: 'Organization configured successfully!'
    },
    auth: {
      login_title: 'Login to your account',
      login_subtitle: 'Enter your credentials to access your accounting workspace',
      register_title: 'Start your free trial',
      register_subtitle: 'Create your account and manage your enterprise finances',
      email: 'Email address',
      password: 'Password',
      confirm_password: 'Confirm password',
      full_name: 'Full Name',
      phone: 'Mobile number',
      forgot_password: 'Forgot Password?',
      sign_in: 'Sign In',
      sign_up: 'Sign Up',
      have_account: 'Already have an account?',
      no_account: 'New to Ledgra?',
      terms_agree: 'I agree to public terms of services and privacy policy of LEDGRA',
      auth_error: 'Authentication failed. Please verify credentials.'
    },
    onboarding: {
      steps: {
        company_info: 'Enterprise Profile',
        legal_vat: 'Taxation & CR Details',
        accounting_setup: 'Accounting Preferences'
      },
      title: 'Initialize Your Organization',
      subtitle: 'Complete these quick steps to customize your ledger environment',
      company_name_ar: 'Company Name (Arabic)',
      company_name_en: 'Company Name (English - optional)',
      activity_type: 'Business Activity Category',
      country: 'Country',
      city: 'City',
      legal_type: 'Legal Structure',
      legal_type_options: {
        individual: 'Sole Proprietorship',
        llc: 'Limited Liability Company (LLC)',
        joint: 'Joint Stock Company',
        branch: 'Foreign Branch Office'
      },
      cr_number: 'Commercial Registration (CR) Number / Unified ID',
      vat_number: 'VAT Registration Number (15 digits)',
      is_vat_registered: 'This organization is VAT registered and authorized to issue TAX invoices',
      fiscal_year_start: 'Fiscal Year Commencement Date',
      currency: 'Operating Currency',
      language: 'System Default Interface Language',
      accounting_mode: 'Accounting Protocol',
      acc_mode_simple: 'Simplified Mode (Invoicing, simple profit-and-loss trackers)',
      acc_mode_pro: 'Professional Mode (Full Chart of Accounts, Double-entry ledgers, Balance Sheets)',
      use_system_start: 'Go-Live Accounting Start Date',
      starting_balances_later: 'Deploy opening transaction ledger entries at a later phase'
    },
    sidebar: {
      home: 'Dashboard Home',
      sales: 'Sales & Customers',
      purchases: 'Purchases & Vendors',
      expenses: 'Expenditure Logs',
      items: 'Products & Services',
      customers: 'Customer Index',
      vendors: 'Vendor Directory',
      accounting: 'Chart of Accounts',
      reports: 'Financial Auditing',
      settings: 'General Settings',
      soon: 'Coming Soon',
      active_org: 'Current Work Org'
    },
    dashboard: {
      welcome: 'Welcome back to LEDGRA 👋',
      tag: 'Here is your enterprise financial report overview for today.',
      kpis: {
        sales: 'Aggregate Sales',
        expenses: 'Total Expenditure',
        profit: 'Operating Net Profit',
        receivables: 'Total Receivables'
      },
      charts: {
        title: 'Revenues vs Expenditures',
        distribution: 'Expenditure Categories Distribution',
        revenue: 'Revenues',
        expenses: 'Expenditures'
      },
      invoices: {
        title: 'Recent Billing Activities',
        num: 'Invoice Code',
        customer: 'Counterparty entity',
        amount: 'Total balance',
        status: 'Status',
        date: 'Publish Date',
        status_paid: ' Settled',
        status_unpaid: ' Unpaid',
        status_partial: ' Partially Paid'
      },
      actions: {
        title: 'Direct Instant actions',
        invoice: 'Generate New Invoice',
        customer: 'Create Client Card',
        expense: 'Log New Expense',
        product: 'Add Product Item'
      },
      alerts: {
        title: 'Alert Tasks Overview',
        task_vat: 'Pending accounts payable due in 7 days',
        task_cr: 'Overdue commercial compliance status verification',
        task_inventory: 'Aggregate inventory levels alerting on 3 items'
      },
      empty_state_title: 'No transactions logged yet',
      empty_state_desc: 'Kickstart your accounting pipeline! Execute a quick action to launch your ledger.'
    },
    settings: {
      title: 'Enterprise Workspace Configuration',
      subtitle: 'Manage legal structures, registered outlets, custom users, and RLS roles',
      tab_info: 'Enterprise & VAT Profile',
      tab_users: 'Workspace Membership & Roles',
      tab_branches: 'Outlets, Locations & ERP nodes',
      vat_status: 'VAT Registration Status',
      user_name: 'Name',
      user_email: 'Email',
      user_role: 'Assigned Role',
      branch_name: 'Branch Title',
      branch_code: 'Branch Reference Code',
      branch_address: 'Outlet Address Location',
      is_main_branch: 'Is Primary Hub Outlet',
      add_branch: 'Register Remote Outlet Branch',
      add_user: 'Invite Corporate Co-Worker'
    }
  }
} as const;

export function useTranslation(lang: Locale = 'ar') {
  return {
    t: (key: string): string => {
      const parts = key.split('.');
      let current: any = translations[lang];
      for (const part of parts) {
        if (current && part in current) {
          current = current[part];
        } else {
          // Fallback to Arabic of same key
          let arCurrent: any = translations['ar'];
          for (const arPart of parts) {
            if (arCurrent && arPart in arCurrent) {
              arCurrent = arCurrent[arPart];
            } else {
              return key;
            }
          }
          return typeof arCurrent === 'string' ? arCurrent : key;
        }
      }
      return typeof current === 'string' ? current : key;
    }
  };
}
