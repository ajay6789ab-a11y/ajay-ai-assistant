import 'package:flutter/material.dart';

import '../../core/theme/app_colors.dart';
import '../../core/theme/app_theme.dart';
import '../../data/models/models.dart';

/// Consent sheet shown before any call or message.
///
/// Security requirement: the assistant never dials or sends on its own — the
/// user sees exactly who is being contacted and what will be sent, and must
/// tap Allow. Returns `true` when approved.
class ConfirmActionSheet extends StatelessWidget {
  const ConfirmActionSheet({super.key, required this.action});

  final AssistantAction action;

  static Future<bool> show(BuildContext context, AssistantAction action) async {
    final bool? approved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      barrierColor: Colors.black.withOpacity(0.72),
      builder: (_) => ConfirmActionSheet(action: action),
    );
    return approved ?? false;
  }

  bool get _isCall => action.type == ActionType.call;

  @override
  Widget build(BuildContext context) {
    final Map<String, dynamic> p = action.params;

    return Container(
      padding: EdgeInsets.only(
        left: 22,
        right: 22,
        top: 18,
        bottom: 26 + MediaQuery.of(context).viewInsets.bottom,
      ),
      decoration: const BoxDecoration(
        gradient: LinearGradient(
          begin: Alignment.topCenter,
          end: Alignment.bottomCenter,
          colors: <Color>[Color(0xFF101528), Color(0xFF080B16)],
        ),
        borderRadius: BorderRadius.vertical(top: Radius.circular(AppTheme.radiusXl)),
        border: Border(top: BorderSide(color: AppColors.strokeStrong)),
      ),
      child: Column(
        mainAxisSize: MainAxisSize.min,
        crossAxisAlignment: CrossAxisAlignment.start,
        children: <Widget>[
          Center(
            child: Container(
              width: 40,
              height: 4,
              decoration: BoxDecoration(
                color: Colors.white.withOpacity(0.18),
                borderRadius: BorderRadius.circular(4),
              ),
            ),
          ),
          const SizedBox(height: 16),
          Container(
            width: 54,
            height: 54,
            decoration: BoxDecoration(
              gradient: AppColors.softGradient,
              borderRadius: BorderRadius.circular(18),
              border: Border.all(color: AppColors.stroke),
            ),
            child: Icon(
              _isCall ? Icons.call_rounded : Icons.sms_rounded,
              color: AppColors.cyan,
              size: 26,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            action.confirmationPrompt ??
                (_isCall ? 'Call ${p['contact']}?' : 'Send message to ${p['contact']}?'),
            style: const TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 7),
          Text(
            _isCall
                ? 'Ajay needs the CALL_PHONE permission and your confirmation. '
                    'Nothing is dialled until you allow it.'
                : 'Your messaging app opens with this text pre-filled. '
                    'Ajay never sends messages silently.',
            style: const TextStyle(fontSize: 13, color: AppColors.textDim, height: 1.5),
          ),
          const SizedBox(height: 13),
          Container(
            width: double.infinity,
            padding: const EdgeInsets.all(14),
            decoration: BoxDecoration(
              color: Colors.black.withOpacity(0.32),
              borderRadius: BorderRadius.circular(AppTheme.radiusSm),
              border: Border.all(color: AppColors.stroke),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: <Widget>[
                _kv(_isCall ? 'Contact' : 'To', '${p['contact'] ?? '—'}'),
                if (_isCall) _kv('Number', '${p['number'] ?? 'from your contacts'}'),
                if (!_isCall) _kv('Channel', '${p['channel'] ?? 'sms'}'.toUpperCase()),
                if (!_isCall) _kv('Message', '${p['body'] ?? '(dictate after confirming)'}'),
                _kv('Permission', _isCall ? 'android.permission.CALL_PHONE' : 'compose intent'),
              ],
            ),
          ),
          const SizedBox(height: 18),
          Row(
            children: <Widget>[
              Expanded(
                child: TextButton(
                  onPressed: () => Navigator.of(context).pop(false),
                  style: TextButton.styleFrom(
                    backgroundColor: AppColors.surface2,
                    padding: const EdgeInsets.symmetric(vertical: 15),
                    shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
                  ),
                  child: const Text('Cancel',
                      style: TextStyle(color: AppColors.textDim, fontWeight: FontWeight.w700)),
                ),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: DecoratedBox(
                  decoration: BoxDecoration(
                    gradient: AppColors.primaryGradient,
                    borderRadius: BorderRadius.circular(15),
                  ),
                  child: TextButton(
                    onPressed: () => Navigator.of(context).pop(true),
                    style: TextButton.styleFrom(
                      padding: const EdgeInsets.symmetric(vertical: 15),
                      shape: RoundedRectangleBorder(borderRadius: BorderRadius.circular(15)),
                    ),
                    child: const Text('Allow',
                        style: TextStyle(color: AppColors.bg0, fontWeight: FontWeight.w800)),
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 12),
          const Center(
            child: Text(
              '🔒 Runtime permission · revocable in Android settings',
              style: TextStyle(fontSize: 10.5, color: AppColors.textFaint),
            ),
          ),
        ],
      ),
    );
  }

  Widget _kv(String k, String v) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 3),
        child: RichText(
          text: TextSpan(
            style: const TextStyle(fontSize: 12.5, color: AppColors.textDim, height: 1.4),
            children: <TextSpan>[
              TextSpan(
                text: '$k  ',
                style: const TextStyle(color: AppColors.text, fontWeight: FontWeight.w600),
              ),
              TextSpan(text: v),
            ],
          ),
        ),
      );
}
