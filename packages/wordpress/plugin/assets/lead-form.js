/**
 * Niche Lead Form — client-side phone validation + AJAX submission
 */
(function () {
  'use strict';

  var form = document.getElementById('niche-lead-form');
  if (!form) return;

  var phoneInput = document.getElementById('niche-phone');
  var phoneError = document.getElementById('niche-phone-error');
  var statusDiv = document.getElementById('niche-form-status');
  var submitBtn = form.querySelector('.niche-submit-btn');

  /**
   * Validate phone: at least 7 digits
   */
  function validatePhone(value) {
    if (!value) return false;
    var digits = value.replace(/\D/g, '');
    return digits.length >= 7;
  }

  // Real-time phone validation
  if (phoneInput) {
    phoneInput.addEventListener('blur', function () {
      if (phoneInput.value && !validatePhone(phoneInput.value)) {
        phoneError.textContent = 'Please enter a valid phone number (at least 7 digits).';
        phoneInput.classList.add('niche-invalid');
      } else {
        phoneError.textContent = '';
        phoneInput.classList.remove('niche-invalid');
      }
    });
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();

    // Client-side validation
    var phone = phoneInput ? phoneInput.value : '';
    if (!validatePhone(phone)) {
      phoneError.textContent = 'Please enter a valid phone number.';
      if (phoneInput) phoneInput.classList.add('niche-invalid');
      if (phoneInput) phoneInput.focus();
      return;
    }

    // Disable submit
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting…';
    statusDiv.textContent = '';
    statusDiv.className = 'niche-form-status';

    // Build form data
    var data = new FormData(form);
    data.append('action', 'niche_submit_lead');
    data.append('nonce', nicheLeadForm.nonce);

    var xhr = new XMLHttpRequest();
    xhr.open('POST', nicheLeadForm.ajaxUrl, true);
    xhr.onload = function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';

      try {
        var resp = JSON.parse(xhr.responseText);
        if (resp.success) {
          // Redirect or show success
          if (resp.data && resp.data.redirectUrl) {
            window.location.href = resp.data.redirectUrl;
            return;
          }
          if (nicheLeadForm.redirectUrl) {
            window.location.href = nicheLeadForm.redirectUrl;
            return;
          }
          statusDiv.textContent = (resp.data && resp.data.message) || nicheLeadForm.successMessage || 'Thank you!';
          statusDiv.className = 'niche-form-status niche-success';
          form.reset();
        } else {
          statusDiv.textContent = (resp.data && resp.data.message) || 'Something went wrong. Please try again.';
          statusDiv.className = 'niche-form-status niche-error-msg';
        }
      } catch (ex) {
        statusDiv.textContent = 'Something went wrong. Please try again.';
        statusDiv.className = 'niche-form-status niche-error-msg';
      }
    };
    xhr.onerror = function () {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit';
      statusDiv.textContent = 'Network error. Please try again.';
      statusDiv.className = 'niche-form-status niche-error-msg';
    };
    xhr.send(data);
  });
})();
