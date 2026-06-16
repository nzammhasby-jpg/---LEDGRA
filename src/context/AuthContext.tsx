import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Profile, Organization, OrganizationRole } from '../types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  currentOrg: Organization | null;
  orgsList: Organization[];
  roleInCurrentOrg: OrganizationRole | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string, phone: string) => Promise<{ error: string | null, verificationRequired?: boolean }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updateUserPassword: (password: string) => Promise<{ error: string | null }>;
  createOrg: (orgData: {
    name_ar: string;
    name_en: string;
    activity_type: string;
    city: string;
    phone: string;
    email: string;
    legal_type: string;
    vat_number: string;
    is_vat_registered: boolean;
    fiscal_year_start: string;
    cr_number: string;
    system_start_date: string;
    accounting_mode: string;
    starting_balances_later: boolean;
  }) => Promise<{ org: Organization | null, error: string | null }>;
  selectOrg: (orgId: string) => void;
  refreshUserData: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Arabic translating for common Supabase Auth errors
const translateAuthError = (message: string): string => {
  if (message.includes('Invalid login credentials')) {
    return 'البريد الإلكتروني أو كلمة المرور غير صحيحة.';
  }
  if (message.includes('Email already exists') || message.includes('already registered')) {
    return 'البريد الإلكتروني مسجل مسبقاً لدينا.';
  }
  if (message.includes('Password should be')) {
    return 'يجب أن تتكون كلمة المرور من 6 خانات أو أكثر.';
  }
  if (message.includes('User not found')) {
    return 'المستخدم غير مسجل لدينا.';
  }
  if (message.includes('Email not confirmed')) {
    return 'الرجاء تفعيل وحفظ حسابك عبر البريد المرسل إليك أولاً.';
  }
  return message || 'فشل في إتمام العملية المحمية.';
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [currentOrg, setCurrentOrg] = useState<Organization | null>(null);
  const [orgsList, setOrgsList] = useState<Organization[]>([]);
  const [roleInCurrentOrg, setRoleInCurrentOrg] = useState<OrganizationRole | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Load Real Data from Supabase
  const loadRealUserData = async (userId: string) => {
    try {
      if (!isSupabaseConfigured) return;

      // Fetch profile
      let { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (profileErr || !profileData) {
        // Safe check or fallback
        const { data: { user: realUser } } = await supabase.auth.getUser();
        if (realUser) {
          const fallbackProfile: Profile = {
            id: userId,
            full_name: realUser.user_metadata.full_name || 'مستخدم لِدجرا',
            phone: realUser.user_metadata.phone || '',
            avatar_url: null,
            created_at: new Date().toISOString()
          };
          await supabase.from('profiles').upsert(fallbackProfile);
          profileData = fallbackProfile;
        }
      }

      setProfile(profileData as Profile);

      // Fetch member organizations
      const { data: memberData, error: memberErr } = await supabase
        .from('organization_members')
        .select(`
          organization_id,
          role,
          organizations (
            id,
            name_ar,
            name_en,
            activity_type,
            country,
            city,
            phone,
            email,
            logo_url,
            legal_type,
            vat_number,
            is_vat_registered,
            fiscal_year_start,
            currency,
            primary_language,
            onboarding_completed,
            cr_number,
            created_by,
            system_start_date,
            accounting_mode,
            starting_balances_later,
            updated_at,
            created_at
          )
        `)
        .eq('profile_id', userId);

      if (!memberErr && memberData) {
        //@ts-ignore
        const userOrgs: Organization[] = memberData
          .map((m: any) => m.organizations)
          .filter(Boolean);

        setOrgsList(userOrgs);

        if (userOrgs.length > 0) {
          const savedOrgId = localStorage.getItem(`ledgra_selected_org_${userId}`);
          const selected = userOrgs.find(o => o.id === savedOrgId) || userOrgs[0];
          setCurrentOrg(selected);

          const memberInfo = memberData.find((m: any) => m.organization_id === selected.id);
          setRoleInCurrentOrg((memberInfo?.role || 'owner') as OrganizationRole);
        } else {
          setCurrentOrg(null);
          setRoleInCurrentOrg(null);
        }
      }
    } catch (e) {
      console.error('Error loading Supabase data:', e);
    } finally {
      setLoading(false);
    }
  };

  // Real Supabase Auth Listeners (Unified single source of session sync)
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let subscriptionObj: any = null;

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session) {
          setUser(session.user);
          loadRealUserData(session.user.id);
        } else {
          setUser(null);
          setProfile(null);
          setCurrentOrg(null);
          setOrgsList([]);
          setRoleInCurrentOrg(null);
          setLoading(false);
        }
      })
      .catch(err => {
        console.error("Supabase getSession failed:", err);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // Guard duplicate requests on token refreshes
      if (session) {
        const isUserChanged = !user || user.id !== session.user.id;
        setUser(session.user);
        if (isUserChanged) {
          loadRealUserData(session.user.id);
        }
      } else {
        setUser(null);
        setProfile(null);
        setCurrentOrg(null);
        setOrgsList([]);
        setRoleInCurrentOrg(null);
        setLoading(false);
      }
    });

    subscriptionObj = subscription;

    return () => {
      if (subscriptionObj && typeof subscriptionObj.unsubscribe === 'function') {
        subscriptionObj.unsubscribe();
      }
    };
  }, []);

  const refreshUserData = async () => {
    if (user) {
      await loadRealUserData(user.id);
    }
  };

  // Sign In Action
  const signIn = async (email: string, password: string): Promise<{ error: string | null }> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setLoading(false);
        return { error: translateAuthError(error.message) };
      }

      setUser(data.user);
      await loadRealUserData(data.user!.id);
      return { error: null };
    } catch (e: any) {
      setLoading(false);
      return { error: translateAuthError(e.message) };
    }
  };

  // Sign Up Action
  const signUp = async (email: string, password: string, fullName: string, phone: string): Promise<{ error: string | null, verificationRequired?: boolean }> => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            phone: phone,
          },
        },
      });

      if (error) {
        setLoading(false);
        return { error: translateAuthError(error.message) };
      }

      if (data.user) {
        if (!data.session) {
          setLoading(false);
          return { error: null, verificationRequired: true };
        }
        setUser(data.user);
        await loadRealUserData(data.user.id);
      }
      return { error: null, verificationRequired: false };
    } catch (e: any) {
      setLoading(false);
      return { error: translateAuthError(e.message) };
    }
  };

  // Sign Out Action
  const signOut = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.error(err);
    }
    setUser(null);
    setProfile(null);
    setCurrentOrg(null);
    setOrgsList([]);
    setRoleInCurrentOrg(null);
    setLoading(false);
  };

  // Reset Password email link
  const sendPasswordReset = async (email: string): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/#/reset-password`,
      });
      if (error) return { error: translateAuthError(error.message) };
      return { error: null };
    } catch (e: any) {
      return { error: translateAuthError(e.message) };
    }
  };

  // Set new password
  const updateUserPassword = async (password: string): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { error: translateAuthError(error.message) };
      return { error: null };
    } catch (e: any) {
      return { error: translateAuthError(e.message) };
    }
  };

  // Create Organization Action via secure atomic PostgreSQL RPC
  const createOrg = async (orgData: any): Promise<{ org: Organization | null, error: string | null }> => {
    if (!user) return { org: null, error: 'غير مصرح لك بإجراء هذه العملية.' };

    try {
      setLoading(true);

      // Invoke safe secure idempotent transactional database RPC function
      const { data: orgIdResult, error: rpcErr } = await supabase.rpc('create_organization_with_owner', {
        p_name_ar: orgData.name_ar,
        p_name_en: orgData.name_en || null,
        p_activity_type: orgData.activity_type || null,
        p_city: orgData.city || null,
        p_phone: orgData.phone || null,
        p_email: orgData.email || null,
        p_legal_type: orgData.legal_type || null,
        p_vat_number: orgData.vat_number || null,
        p_is_vat_registered: orgData.is_vat_registered || false,
        p_fiscal_year_start: orgData.fiscal_year_start || null,
        p_cr_number: orgData.cr_number || null,
        p_system_start_date: orgData.system_start_date || null,
        p_accounting_mode: orgData.accounting_mode || 'standard',
        p_starting_balances_later: orgData.starting_balances_later || false
      });

      if (rpcErr || !orgIdResult) {
        throw new Error(rpcErr?.message || 'فشل في إنشاء المنشأة عبر المعالج البرمجي الآمن.');
      }

      // Fetch the newly created Organization directly from the database to ensure state sync
      const { data: orgDataResult, error: selectErr } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgIdResult)
        .single();

      if (selectErr || !orgDataResult) {
        throw new Error('فشل استرجاع بيانات المنشأة التي تم جدولتها سحابياً.');
      }

      // Re-populate and sync profile lists
      await loadRealUserData(user.id);

      return { org: orgDataResult as Organization, error: null };

    } catch (e: any) {
      setLoading(false);
      return { org: null, error: translateAuthError(e.message) };
    }
  };

  // Change Active Selected Organization Switcher
  const selectOrg = (orgId: string) => {
    if (!user) return;
    const selected = orgsList.find(o => o.id === orgId);
    if (selected) {
      setCurrentOrg(selected);
      localStorage.setItem(`ledgra_selected_org_${user.id}`, orgId);
      loadRealUserData(user.id);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      profile,
      currentOrg,
      orgsList,
      roleInCurrentOrg,
      loading,
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
      updateUserPassword,
      createOrg,
      selectOrg,
      refreshUserData
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
