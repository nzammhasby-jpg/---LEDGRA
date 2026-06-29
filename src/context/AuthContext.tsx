import React, { createContext, useContext, useState, useEffect } from 'react';
import { User, Session, Subscription } from '@supabase/supabase-js';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { Profile, Organization, OrganizationRole, CreateOrgInput, MembershipJoinData } from '../types';

interface AuthContextType {
  user: User | null;
  profile: Profile | null;
  currentOrg: Organization | null;
  orgsList: Organization[];
  roleInCurrentOrg: OrganizationRole | null;
  loading: boolean;
  dataError: string | null;
  clearDataError: () => void;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string, phone: string) => Promise<{ error: string | null, verificationRequired?: boolean }>;
  signOut: () => Promise<void>;
  sendPasswordReset: (email: string) => Promise<{ error: string | null }>;
  updateUserPassword: (password: string) => Promise<{ error: string | null }>;
  createOrg: (orgData: CreateOrgInput) => Promise<{ org: Organization | null, error: string | null }>;
  updateOrg: (orgId: string, orgData: Partial<Organization>) => Promise<{ org: Organization | null, error: string | null }>;
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
  const [dataError, setDataError] = useState<string | null>(null);

  const loadedUserIdRef = React.useRef<string | null>(null);
  const loadingUserRef = React.useRef<string | null>(null);

  // Load Real Data from Supabase
  const loadRealUserData = async (userId: string) => {
    try {
      if (!isSupabaseConfigured) return;
      setLoading(true);
      setDataError(null);

      // Fetch profile
      const { data: profileData, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .maybeSingle();

      if (profileErr) {
        console.error('Failed to load profile due to database error:', profileErr);
        throw new Error(profileErr.message);
      }

      if (!profileData) {
        throw new Error('لم يتم تفعيل حسابك وإنشاء ملفك الشخصي عبر المشغل التلقائي (Trigger). يرجى التأكد من تشغيل initial_schema.sql بنجاح.');
      }

      setProfile(profileData as Profile);

      // Fetch member organizations
      let memberData: any = null;
      let memberErr: any = null;

      const firstAttempt = await supabase
        .from('organization_members')
        .select(`
          organization_id,
          role,
          organizations (
            id,
            name_ar,
            name_en,
            activity_type,
            country_code,
            city,
            phone,
            email,
            logo_url,
            legal_type,
            vat_number,
            is_vat_registered,
            fiscal_year_start,
            currency_code,
            primary_language,
            onboarding_completed,
            onboarding_step,
            setup_completed_at,
            cr_number,
            created_by,
            system_start_date,
            accounting_mode,
            starting_balances_later,
            updated_at,
            created_at
          )
        `)
        .eq('profile_id', userId)
        .eq('is_active', true);

      if (firstAttempt.error && (firstAttempt.error.message.includes('is_active') || firstAttempt.error.message.includes('column') || firstAttempt.error.code === 'PGRST116')) {
        const secondAttempt = await supabase
          .from('organization_members')
          .select(`
            organization_id,
            role,
            organizations (
              id,
              name_ar,
              name_en,
              activity_type,
              country_code,
              city,
              phone,
              email,
              logo_url,
              legal_type,
              vat_number,
              is_vat_registered,
              fiscal_year_start,
              currency_code,
              primary_language,
              onboarding_completed,
              onboarding_step,
              setup_completed_at,
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
        memberData = secondAttempt.data;
        memberErr = secondAttempt.error;
      } else {
        memberData = firstAttempt.data;
        memberErr = firstAttempt.error;
      }

      if (memberErr) {
        console.error('Failed to load organization memberships due to database error:', memberErr);
        throw new Error(memberErr.message);
      }

      if (memberData) {
        const memberships = (memberData as unknown as MembershipJoinData[]);
        const userOrgs: Organization[] = memberships
          .map(m => m.organizations)
          .filter((org): org is Organization => !!org);

        setOrgsList(userOrgs);

        if (userOrgs.length > 0) {
          const savedOrgId = localStorage.getItem(`ledgra_selected_org_${userId}`);
          const completedOrgs = userOrgs.filter(o => o.onboarding_completed === true);
          const savedCompletedOrg = completedOrgs.find(org => org.id === savedOrgId);

          // الأولوية: 1) المحفوظة المكتملة 2) أي مكتملة 3) المحفوظة أياً كانت 4) أول منشأة
          const selected = savedCompletedOrg ?? completedOrgs[0] ?? userOrgs.find(o => o.id === savedOrgId) ?? userOrgs[0];

          if (selected) {
            localStorage.setItem(`ledgra_selected_org_${userId}`, selected.id);
            setCurrentOrg(selected);
            const memberInfo = memberships.find(m => m.organization_id === selected.id);
            setRoleInCurrentOrg((memberInfo?.role ?? null) as OrganizationRole | null);
          } else {
            setCurrentOrg(null);
            setRoleInCurrentOrg(null);
          }
        } else {
          setCurrentOrg(null);
          setRoleInCurrentOrg(null);
        }
      }

      // Mark successful loading
      loadedUserIdRef.current = userId;

    } catch (e: unknown) {
      const err = e as Error;
      console.error('Error loading Supabase data:', err);
      setDataError(err.message || 'حدث خطأ داخلي أثناء تحميل بيانات النظام المتصل بالسحابة.');
      loadedUserIdRef.current = null;
    } finally {
      loadingUserRef.current = null;
      setLoading(false);
    }
  };

  const clearDataError = () => {
    setDataError(null);
  };

  // Real Supabase Auth Listeners (Unified single source of session sync)
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }

    setLoading(true);
    let subscriptionObj: Subscription | null = null;

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (session) {
          setUser(session.user);
          if (loadingUserRef.current !== session.user.id && loadedUserIdRef.current !== session.user.id) {
            loadingUserRef.current = session.user.id;
            loadRealUserData(session.user.id);
          }
        } else {
          loadedUserIdRef.current = null;
          loadingUserRef.current = null;
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
      if (session) {
        setUser(session.user);
        if (loadingUserRef.current !== session.user.id && loadedUserIdRef.current !== session.user.id) {
          loadingUserRef.current = session.user.id;
          loadRealUserData(session.user.id);
        }
      } else {
        loadedUserIdRef.current = null;
        loadingUserRef.current = null;
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
      loadedUserIdRef.current = data.user!.id;
      await loadRealUserData(data.user!.id);
      return { error: null };
    } catch (e: unknown) {
      const err = e as Error;
      setLoading(false);
      return { error: translateAuthError(err.message) };
    }
  };

  // Sign Up Action
  const signUp = async (email: string, password: string, fullName: string, phone: string): Promise<{ error: string | null, verificationRequired?: boolean }> => {
    setLoading(true);
    try {
      const emailRedirectTo = `${window.location.origin}/auth/confirm`;
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo,
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
        loadedUserIdRef.current = data.user.id;
        await loadRealUserData(data.user.id);
      }
      return { error: null, verificationRequired: false };
    } catch (e: unknown) {
      const err = e as Error;
      setLoading(false);
      return { error: translateAuthError(err.message) };
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
      const appOrigin = window.location.origin.replace(/\/$/, '');
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${appOrigin}/#/reset-password`,
      });
      if (error) return { error: translateAuthError(error.message) };
      return { error: null };
    } catch (e: unknown) {
      const err = e as Error;
      return { error: translateAuthError(err.message) };
    }
  };

  // Set new password
  const updateUserPassword = async (password: string): Promise<{ error: string | null }> => {
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { error: translateAuthError(error.message) };
      return { error: null };
    } catch (e: unknown) {
      const err = e as Error;
      return { error: translateAuthError(err.message) };
    }
  };

  // Create Organization Action via secure atomic PostgreSQL RPC
  const createOrg = async (orgData: CreateOrgInput): Promise<{ org: Organization | null, error: string | null }> => {
    if (!user) return { org: null, error: 'غير مصرح لك بإجراء هذه العملية.' };

    try {
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
        p_accounting_mode: orgData.accounting_mode || 'pro',
        p_starting_balances_later: orgData.starting_balances_later !== undefined ? orgData.starting_balances_later : true,
        p_onboarding_completed: orgData.onboarding_completed !== undefined ? orgData.onboarding_completed : true,
        p_onboarding_step: orgData.onboarding_step !== undefined ? orgData.onboarding_step : 3
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

      const finalOrg = orgDataResult as Organization;

      // Update states directly
      setOrgsList(prev => {
        const alreadyExists = prev.some(o => o.id === finalOrg.id);
        if (alreadyExists) return prev.map(o => o.id === finalOrg.id ? finalOrg : o);
        return [...prev, finalOrg];
      });
      setCurrentOrg(finalOrg);
      setRoleInCurrentOrg('owner');
      localStorage.setItem(`ledgra_selected_org_${user.id}`, finalOrg.id);
      loadedUserIdRef.current = user.id; // منع onAuthStateChange من إعادة التحميل

      return { org: finalOrg, error: null };

    } catch (e: unknown) {
      const err = e as Error;
      return { org: null, error: translateAuthError(err.message) };
    }
  };

  // Update Organization Action
  const updateOrg = async (orgId: string, orgData: Partial<Organization>): Promise<{ org: Organization | null, error: string | null }> => {
    if (!user) return { org: null, error: 'غير مصرح لك بإجراء هذه العملية.' };

    try {
      // 1. Execute the update, matching the organization by ID
      const { error: updateErr } = await supabase
        .from('organizations')
        .update(orgData)
        .eq('id', orgId);

      if (updateErr) {
        throw new Error(updateErr.message || 'فشلت عملية تحديث بيانات المنشأة.');
      }

      // 2. Query the updated single row explicitly
      const { data: updatedData, error: fetchErr } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .single();

      if (fetchErr || !updatedData) {
        throw new Error(fetchErr?.message || 'فشل استرجاع الصف المحدث للمنشأة.');
      }

      const finalOrg = updatedData as Organization;

      // Update states directly
      setOrgsList(prev => prev.map(org => org.id === finalOrg.id ? finalOrg : org));
      setCurrentOrg(finalOrg);
      localStorage.setItem(`ledgra_selected_org_${user.id}`, finalOrg.id);
      loadedUserIdRef.current = user.id; // منع onAuthStateChange من إعادة التحميل

      return { org: finalOrg, error: null };

    } catch (e: unknown) {
      const err = e as Error;
      return { org: null, error: translateAuthError(err.message) };
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
      dataError,
      signIn,
      signUp,
      signOut,
      sendPasswordReset,
      updateUserPassword,
      createOrg,
      updateOrg,
      selectOrg,
      refreshUserData,
      clearDataError
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
