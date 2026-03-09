/**
 * Niche Lead Form — Gutenberg block registration
 * Server-side rendered via render_callback in PHP
 */
(function (blocks, element, blockEditor) {
  var el = element.createElement;
  var useBlockProps = blockEditor.useBlockProps;

  blocks.registerBlockType('niche/lead-form', {
    title: 'Niche Lead Form',
    description: 'Display a lead capture form that sends submissions to Niche.',
    icon: 'feedback',
    category: 'widgets',
    keywords: ['niche', 'lead', 'form', 'contact'],
    supports: {
      html: false,
      multiple: false,
    },
    edit: function () {
      var blockProps = useBlockProps
        ? useBlockProps({ className: 'niche-lead-form-block-preview' })
        : {};

      return el(
        'div',
        blockProps,
        el(
          'div',
          {
            style: {
              padding: '20px',
              background: '#f0f0f0',
              border: '1px dashed #999',
              borderRadius: '4px',
              textAlign: 'center',
            },
          },
          el('span', { className: 'dashicons dashicons-feedback', style: { fontSize: '24px', marginBottom: '8px', display: 'block' } }),
          el('strong', null, 'Niche Lead Form'),
          el('p', { style: { margin: '8px 0 0', fontSize: '13px', color: '#666' } },
            'This block renders the Niche lead capture form on the front end.')
        )
      );
    },
    save: function () {
      // Server-side rendered
      return null;
    },
  });
})(
  window.wp.blocks,
  window.wp.element,
  window.wp.blockEditor
);
