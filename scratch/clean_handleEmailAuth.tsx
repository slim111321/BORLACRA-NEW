  const handleEmailAuth = async () => {
    if (!email || !password) {
      alert("Please enter both email and password.");
      return;
    }
    if (password.length < 6) {
      alert("Password must be at least 6 characters long.");
      return;
    }
    setIsLoading(true);
    if (isSignupMode) {
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        alert(error.message);
        setIsLoading(false);
        return;
      }
      if (data.user) {
        const { error: pError } = await supabase.from('profiles').insert({
          id: data.user.id,
          full_name: email.split('@')[0],
          role: role,
          onboarding_completed: role === UserRole.CUSTOMER
        });
        if (pError) console.error("Profile creation error:", pError);
      }
      alert("Account created successfully! You can now log in.");
    } else {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) {
        alert(error.message + "\n\nIf you don't have an account, switch to Signup mode.");
        setIsLoading(false);
        return;
      }
      if (data.session?.user) {
        try {
          const { data: profile, error: pError } = await supabase.from('profiles').select('*').eq('id', data.session.user.id).single();
          if (pError) throw pError;
          if (profile) {
            setUserProfile(profile);
            setRole(profile.role as UserRole);
            navigateByRole(profile);
          } else {
            alert("Profile not found.");
          }
        } catch (e: any) {
          alert("Error: " + e.message);
        }
      }
    }
    setIsLoading(false);
  };
