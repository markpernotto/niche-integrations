<?php
/**
 * Plugin Name: Niche Lead Capture
 * Plugin URI: https://github.com/your-org/niche-integrations
 * Description: Captures form submissions and sends leads directly to Niche API
 * Version: 2.0.0
 * Author: Niche Integrations
 * License: GPL v2 or later
 * Text Domain: niche-lead-capture
 */

if (!defined('ABSPATH')) {
    exit;
}

define('NICHE_LC_VERSION', '2.0.0');
define('NICHE_LC_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('NICHE_LC_PLUGIN_URL', plugin_dir_url(__FILE__));

/**
 * Main plugin class — calls Niche API directly from PHP (no webhook relay)
 */
class Niche_Lead_Capture {

    private $api_key;
    private $business_id;
    private $api_base_url;
    private $success_message;
    private $redirect_url;

    public function __construct() {
        $this->api_key         = get_option('niche_api_key', '');
        $this->business_id     = get_option('niche_business_id', '');
        $this->api_base_url    = get_option('niche_api_base_url', 'https://app.nicheandleads.com');
        $this->success_message = get_option('niche_success_message', 'Thank you! Your information has been submitted.');
        $this->redirect_url    = get_option('niche_redirect_url', '');

        // Admin
        add_action('admin_menu', array($this, 'add_admin_menu'));
        add_action('admin_init', array($this, 'register_settings'));

        // AJAX handler for fetching businesses in admin
        add_action('wp_ajax_niche_fetch_businesses', array($this, 'ajax_fetch_businesses'));

        // Shortcode
        add_shortcode('niche_lead_form', array($this, 'render_lead_form_shortcode'));

        // Gutenberg block
        add_action('init', array($this, 'register_gutenberg_block'));

        // Form submission handler (front-end AJAX)
        add_action('wp_ajax_niche_submit_lead', array($this, 'handle_form_submission'));
        add_action('wp_ajax_nopriv_niche_submit_lead', array($this, 'handle_form_submission'));

        // Enqueue front-end assets
        add_action('wp_enqueue_scripts', array($this, 'enqueue_frontend_assets'));

        // Third-party form hooks
        add_action('wpcf7_mail_sent', array($this, 'handle_contact_form_7'));
        add_action('wpforms_process_complete', array($this, 'handle_wpforms'), 10, 4);
        add_action('gform_after_submission', array($this, 'handle_gravity_forms'), 10, 2);
    }

    // =========================================================================
    // Niche API
    // =========================================================================

    /**
     * POST lead directly to Niche API
     * Payload: { name, phone, info, source: "WORDPRESS" }
     */
    private function create_lead($lead_data) {
        if (empty($this->api_key) || empty($this->business_id)) {
            error_log('Niche Lead Capture: API Key or Business ID not configured');
            return new WP_Error('not_configured', 'Plugin is not fully configured');
        }

        $url = rtrim($this->api_base_url, '/') . '/api/partner/v1/businesses/' . $this->business_id . '/leads/';

        $payload = array(
            'name'   => isset($lead_data['name'])   ? sanitize_text_field($lead_data['name'])   : '',
            'phone'  => isset($lead_data['phone'])  ? sanitize_text_field($lead_data['phone'])  : '',
            'info'   => isset($lead_data['info'])    ? sanitize_textarea_field($lead_data['info'])    : '',
            'source' => 'WORDPRESS',
        );

        $response = wp_remote_post($url, array(
            'method'  => 'POST',
            'timeout' => 15,
            'headers' => array(
                'Content-Type'  => 'application/json',
                'Authorization' => 'Bearer ' . $this->api_key,
            ),
            'body' => wp_json_encode($payload),
        ));

        if (is_wp_error($response)) {
            error_log('Niche Lead Capture Error: ' . $response->get_error_message());
            return $response;
        }

        $status = wp_remote_retrieve_response_code($response);
        $body   = wp_remote_retrieve_body($response);

        if ($status < 200 || $status >= 300) {
            error_log('Niche Lead Capture Error: HTTP ' . $status . ' — ' . $body);
            return new WP_Error('api_error', 'Niche API returned HTTP ' . $status, array('status' => $status, 'body' => $body));
        }

        return json_decode($body, true);
    }

    /**
     * GET /v1/businesses — used by the admin business selector dropdown
     */
    private function fetch_businesses() {
        if (empty($this->api_key)) {
            return new WP_Error('no_api_key', 'API key is not set');
        }

        $url = rtrim($this->api_base_url, '/') . '/api/partner/v1/businesses/';

        $response = wp_remote_get($url, array(
            'timeout' => 15,
            'headers' => array(
                'Authorization' => 'Bearer ' . $this->api_key,
            ),
        ));

        if (is_wp_error($response)) {
            return $response;
        }

        $status = wp_remote_retrieve_response_code($response);
        $body   = wp_remote_retrieve_body($response);

        if ($status < 200 || $status >= 300) {
            return new WP_Error('api_error', 'HTTP ' . $status);
        }

        return json_decode($body, true);
    }

    /**
     * Build lead data from common form fields.
     * Everything that isn't name/phone goes into info.
     */
    private function build_lead_data($fields) {
        $name  = '';
        $phone = '';
        $info_lines = array();

        // Name
        if (!empty($fields['name'])) {
            $name = $fields['name'];
        } elseif (!empty($fields['first_name']) || !empty($fields['last_name'])) {
            $name = trim(($fields['first_name'] ?? '') . ' ' . ($fields['last_name'] ?? ''));
        }

        // Phone
        if (!empty($fields['phone'])) {
            $phone = $fields['phone'];
        }

        // Email → info
        if (!empty($fields['email'])) {
            $info_lines[] = 'Email: ' . $fields['email'];
        }

        // Message → info
        if (!empty($fields['message'])) {
            $info_lines[] = $fields['message'];
        }

        // Any extras → info
        $known = array('name', 'first_name', 'last_name', 'phone', 'email', 'message', 'businessId', 'source', 'action', 'nonce', '_wp_http_referer');
        foreach ($fields as $key => $value) {
            if (!in_array($key, $known, true) && !empty($value)) {
                $info_lines[] = $key . ': ' . $value;
            }
        }

        return array(
            'name'  => $name,
            'phone' => $phone,
            'info'  => implode("\n", $info_lines),
        );
    }

    // =========================================================================
    // Admin
    // =========================================================================

    public function add_admin_menu() {
        add_options_page(
            'Niche Lead Capture Settings',
            'Niche Lead Capture',
            'manage_options',
            'niche-lead-capture',
            array($this, 'render_settings_page')
        );
    }

    public function register_settings() {
        register_setting('niche_lead_capture', 'niche_api_key');
        register_setting('niche_lead_capture', 'niche_business_id');
        register_setting('niche_lead_capture', 'niche_api_base_url');
        register_setting('niche_lead_capture', 'niche_success_message');
        register_setting('niche_lead_capture', 'niche_redirect_url');
    }

    public function render_settings_page() {
        $businesses = array();
        if (!empty($this->api_key)) {
            $result = $this->fetch_businesses();
            if (!is_wp_error($result) && is_array($result)) {
                $businesses = $result;
            }
        }
        ?>
        <div class="wrap">
            <h1>Niche Lead Capture Settings</h1>
            <form method="post" action="options.php">
                <?php settings_fields('niche_lead_capture'); ?>
                <table class="form-table">
                    <tr>
                        <th scope="row"><label for="niche_api_key">Niche API Key</label></th>
                        <td>
                            <input type="password"
                                   id="niche_api_key"
                                   name="niche_api_key"
                                   value="<?php echo esc_attr(get_option('niche_api_key')); ?>"
                                   class="regular-text" />
                            <p class="description">Your Niche Partner API key (Bearer token)</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="niche_business_id">Business</label></th>
                        <td>
                            <?php if (!empty($businesses)) : ?>
                                <select id="niche_business_id" name="niche_business_id" class="regular-text">
                                    <option value="">— Select a Business —</option>
                                    <?php foreach ($businesses as $biz) : ?>
                                        <option value="<?php echo esc_attr($biz['id']); ?>"
                                            <?php selected(get_option('niche_business_id'), $biz['id']); ?>>
                                            <?php echo esc_html($biz['name']); ?>
                                        </option>
                                    <?php endforeach; ?>
                                </select>
                                <p class="description">Select the business to receive leads</p>
                            <?php else : ?>
                                <input type="text"
                                       id="niche_business_id"
                                       name="niche_business_id"
                                       value="<?php echo esc_attr(get_option('niche_business_id')); ?>"
                                       class="regular-text"
                                       placeholder="Enter Business ID" />
                                <p class="description">Save your API key first to load the business dropdown</p>
                            <?php endif; ?>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="niche_api_base_url">API Base URL</label></th>
                        <td>
                            <input type="url"
                                   id="niche_api_base_url"
                                   name="niche_api_base_url"
                                   value="<?php echo esc_attr(get_option('niche_api_base_url', 'https://app.nicheandleads.com')); ?>"
                                   class="regular-text" />
                            <p class="description">Default: https://app.nicheandleads.com</p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="niche_success_message">Success Message</label></th>
                        <td>
                            <input type="text"
                                   id="niche_success_message"
                                   name="niche_success_message"
                                   value="<?php echo esc_attr(get_option('niche_success_message', 'Thank you! Your information has been submitted.')); ?>"
                                   class="large-text" />
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><label for="niche_redirect_url">Redirect URL (optional)</label></th>
                        <td>
                            <input type="url"
                                   id="niche_redirect_url"
                                   name="niche_redirect_url"
                                   value="<?php echo esc_attr(get_option('niche_redirect_url')); ?>"
                                   class="regular-text"
                                   placeholder="https://example.com/thank-you" />
                            <p class="description">If set, redirects the user after successful submission instead of showing the success message</p>
                        </td>
                    </tr>
                </table>
                <?php submit_button(); ?>
            </form>

            <hr />
            <h2>Usage</h2>
            <p>Add the lead capture form to any page or post using:</p>
            <ul>
                <li><strong>Shortcode:</strong> <code>[niche_lead_form]</code></li>
                <li><strong>Gutenberg:</strong> Search for "Niche Lead Form" in the block inserter</li>
            </ul>
            <p>The plugin also hooks into Contact Form 7, WPForms, and Gravity Forms automatically.</p>
        </div>
        <?php
    }

    /**
     * AJAX: fetch businesses for admin dropdown (live refresh)
     */
    public function ajax_fetch_businesses() {
        check_ajax_referer('niche_admin_nonce', 'nonce');

        if (!current_user_can('manage_options')) {
            wp_send_json_error('Unauthorized');
        }

        // Use the POSTed API key (might not be saved yet)
        $api_key = isset($_POST['api_key']) ? sanitize_text_field($_POST['api_key']) : $this->api_key;
        if (empty($api_key)) {
            wp_send_json_error('No API key provided');
        }

        $url = rtrim($this->api_base_url, '/') . '/api/partner/v1/businesses/';
        $response = wp_remote_get($url, array(
            'timeout' => 15,
            'headers' => array(
                'Authorization' => 'Bearer ' . $api_key,
            ),
        ));

        if (is_wp_error($response)) {
            wp_send_json_error($response->get_error_message());
        }

        $status = wp_remote_retrieve_response_code($response);
        if ($status < 200 || $status >= 300) {
            wp_send_json_error('HTTP ' . $status);
        }

        $businesses = json_decode(wp_remote_retrieve_body($response), true);
        wp_send_json_success($businesses);
    }

    // =========================================================================
    // Frontend: Shortcode
    // =========================================================================

    public function enqueue_frontend_assets() {
        // Only enqueue when shortcode or block is used (checked via has_shortcode / block)
        global $post;
        if (!is_a($post, 'WP_Post')) return;

        if (has_shortcode($post->post_content, 'niche_lead_form') || has_block('niche/lead-form', $post)) {
            wp_enqueue_script(
                'niche-lead-form',
                NICHE_LC_PLUGIN_URL . 'assets/lead-form.js',
                array(),
                NICHE_LC_VERSION,
                true
            );
            wp_localize_script('niche-lead-form', 'nicheLeadForm', array(
                'ajaxUrl'        => admin_url('admin-ajax.php'),
                'nonce'          => wp_create_nonce('niche_lead_form_nonce'),
                'successMessage' => $this->success_message,
                'redirectUrl'    => $this->redirect_url,
            ));
            wp_enqueue_style(
                'niche-lead-form',
                NICHE_LC_PLUGIN_URL . 'assets/lead-form.css',
                array(),
                NICHE_LC_VERSION
            );
        }
    }

    public function render_lead_form_shortcode($atts) {
        $atts = shortcode_atts(array(), $atts, 'niche_lead_form');

        ob_start();
        ?>
        <div class="niche-lead-form-wrapper">
            <form id="niche-lead-form" class="niche-lead-form" novalidate>
                <div class="niche-field">
                    <label for="niche-name">Name <span class="required">*</span></label>
                    <input type="text" id="niche-name" name="name" required />
                </div>
                <div class="niche-field">
                    <label for="niche-phone">Phone <span class="required">*</span></label>
                    <input type="tel" id="niche-phone" name="phone" required
                           placeholder="(555) 123-4567"
                           pattern="[\d\s\+\-\(\)]{7,}" />
                    <span class="niche-error" id="niche-phone-error"></span>
                </div>
                <div class="niche-field">
                    <label for="niche-email">Email</label>
                    <input type="email" id="niche-email" name="email" />
                </div>
                <div class="niche-field">
                    <label for="niche-message">Message</label>
                    <textarea id="niche-message" name="message" rows="4"></textarea>
                </div>
                <div class="niche-field">
                    <button type="submit" class="niche-submit-btn">Submit</button>
                </div>
                <div class="niche-form-status" id="niche-form-status"></div>
            </form>
        </div>
        <?php
        return ob_get_clean();
    }

    // =========================================================================
    // Frontend: AJAX form submission handler
    // =========================================================================

    public function handle_form_submission() {
        check_ajax_referer('niche_lead_form_nonce', 'nonce');

        $name    = isset($_POST['name'])    ? sanitize_text_field($_POST['name'])    : '';
        $phone   = isset($_POST['phone'])   ? sanitize_text_field($_POST['phone'])   : '';
        $email   = isset($_POST['email'])   ? sanitize_email($_POST['email'])        : '';
        $message = isset($_POST['message']) ? sanitize_textarea_field($_POST['message']) : '';

        if (empty($phone)) {
            wp_send_json_error(array('message' => 'Phone number is required.'));
        }

        // Validate phone: at least 7 digits
        $digits = preg_replace('/\D/', '', $phone);
        if (strlen($digits) < 7) {
            wp_send_json_error(array('message' => 'Please enter a valid phone number.'));
        }

        // Build info
        $info_lines = array();
        if (!empty($email)) {
            $info_lines[] = 'Email: ' . $email;
        }
        if (!empty($message)) {
            $info_lines[] = $message;
        }

        $lead_data = array(
            'name'  => $name,
            'phone' => $phone,
            'info'  => implode("\n", $info_lines),
        );

        $result = $this->create_lead($lead_data);

        if (is_wp_error($result)) {
            wp_send_json_error(array('message' => 'Failed to submit. Please try again.'));
        }

        wp_send_json_success(array(
            'message'     => $this->success_message,
            'redirectUrl' => $this->redirect_url,
        ));
    }

    // =========================================================================
    // Gutenberg Block
    // =========================================================================

    public function register_gutenberg_block() {
        if (!function_exists('register_block_type')) return;

        // Server-side rendered block — uses the same shortcode output
        register_block_type('niche/lead-form', array(
            'render_callback' => array($this, 'render_lead_form_shortcode'),
            'attributes'      => array(),
        ));

        // Register block editor script
        wp_register_script(
            'niche-lead-form-block',
            NICHE_LC_PLUGIN_URL . 'assets/block.js',
            array('wp-blocks', 'wp-element', 'wp-block-editor'),
            NICHE_LC_VERSION
        );

        // Only enqueue in admin
        if (is_admin()) {
            add_action('enqueue_block_editor_assets', function() {
                wp_enqueue_script('niche-lead-form-block');
            });
        }
    }

    // =========================================================================
    // Third-party form hooks (CF7, WPForms, GravityForms)
    // All now build { name, phone, info } and call create_lead() directly
    // =========================================================================

    public function handle_contact_form_7($contact_form) {
        $submission = WPCF7_Submission::get_instance();
        if (!$submission) return;

        $data = $submission->get_posted_data();
        $fields = array(
            'name'    => $data['your-name']    ?? ($data['name'] ?? ''),
            'phone'   => $data['your-phone']   ?? ($data['phone'] ?? ''),
            'email'   => $data['your-email']   ?? ($data['email'] ?? ''),
            'message' => $data['your-message'] ?? ($data['message'] ?? ''),
        );

        $lead = $this->build_lead_data(array_filter($fields));
        $this->create_lead($lead);
    }

    public function handle_wpforms($fields, $entry, $form_data, $entry_id) {
        $mapped = array();
        foreach ($fields as $field) {
            $label = isset($field['name']) ? $field['name'] : ($field['label'] ?? '');
            $value = $field['value'] ?? '';
            $key   = strtolower($label);

            if (strpos($key, 'name') !== false)    { $mapped['name']    = $value; }
            elseif (strpos($key, 'email') !== false) { $mapped['email']   = $value; }
            elseif (strpos($key, 'phone') !== false || strpos($key, 'tel') !== false) { $mapped['phone'] = $value; }
            elseif (strpos($key, 'message') !== false || strpos($key, 'comment') !== false) { $mapped['message'] = $value; }
            else { $mapped[$label] = $value; }
        }

        $lead = $this->build_lead_data(array_filter($mapped));
        $this->create_lead($lead);
    }

    public function handle_gravity_forms($entry, $form) {
        $mapped = array();
        foreach ($form['fields'] as $field) {
            $label = $field->label;
            $value = rgar($entry, $field->id);
            $key   = strtolower($label);

            if (strpos($key, 'name') !== false)    { $mapped['name']    = $value; }
            elseif (strpos($key, 'email') !== false) { $mapped['email']   = $value; }
            elseif (strpos($key, 'phone') !== false || strpos($key, 'tel') !== false) { $mapped['phone'] = $value; }
            elseif (strpos($key, 'message') !== false || strpos($key, 'comment') !== false) { $mapped['message'] = $value; }
            else { $mapped[$label] = $value; }
        }

        $lead = $this->build_lead_data(array_filter($mapped));
        $this->create_lead($lead);
    }
}

// Initialize
new Niche_Lead_Capture();
